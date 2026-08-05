
const PKR = (n) => 'PKR ' + n.toLocaleString('en-PK');
const PRICE = 3850;
const ORIGINAL_PRICE = 4500;
const DEFAULT_LONGEVITY = '8–10 hours';
const DEFAULT_HOW_TO_USE = 'Apply your fragrance to clean, moisturized skin and pulse points such as the wrists, neck, and behind the ears. Avoid rubbing the fragrance after application.';
const DEFAULT_DELIVERY_INFO = 'We deliver across Pakistan through our trusted courier partners. Orders are typically delivered within 2–6 business days, depending on your location.';
const DEFAULT_RETURN_POLICY = 'Returns or exchanges are only accepted if you receive the wrong product or if the item arrives damaged or defective. Requests must be made within 48 hours of delivery.';
const STAR_CHARS = '★★★★★☆☆☆☆☆';
const starsFor = (rating) => STAR_CHARS.slice(5 - rating, 10 - rating);

// "Grapefruit, Bergamot, Ginger" -> [{ name }, ...]. Also splits on the "·"
// some older hardcoded copy used, for backward compatibility.
const noteList = (str) => (str || '').split(/[,·]/).map((s) => s.trim()).filter(Boolean).map((name) => ({ name }));

const { loadStoredCart, persistCart, fbTrack, defaultCheckoutForm, computeDiscount, validateVoucher, validateCheckoutForm, placeOrder } = window.InfusoCart;

// Trimmed, self-contained copy of the same hardcoded fallback content used on
// the main landing page (public/AETHER Landing.dc.html) — this page boots
// standalone (its own <x-dc> document, no shared imports across pages in this
// runtime), so it keeps its own copy the same way the landing page's own
// editorial/boxes sections already keep independent copies of this data.
const CATALOG = [
  { id: 'aether', name: 'AETHER', no: 'No. 01', category: 'UNISEX',
    accent: 'rgba(150,220,235,0.85)', img: '/products/aether.webp', box: '/products/aether_box.webp',
    editorialTall: '/products/aether_dark.webp', editorialWide: '/products/aether_slate.webp',
    tagline: 'citrus air over warm stone', top: 'Grapefruit, Bergamot, Ginger', heart: 'Rosemary, Sage, Geranium, Water Notes', base: 'Ambroxan, Amber, Labdanum',
    desc: 'A bright burst of grapefruit and bergamot sharpened with ginger, easing into an herbal heart of rosemary, sage and geranium lifted by cool water notes, before settling into a warm, mineral base of ambroxan, amber and labdanum.',
    inspired: 'INSPIRED BY L’IMMENSITÉ · LOUIS VUITTON' },
  { id: 'aria', name: 'ARIA', no: 'No. 02', category: 'WOMEN',
    accent: 'rgba(195,170,235,0.9)', img: '/products/aria.webp', box: '/products/aria_box.webp',
    editorialTall: '/products/aria_hands.webp', editorialWide: '/products/aria_citrus.webp',
    tagline: 'sicilian light, held in musk', top: 'Sicilian Orange, Calabrian Bergamot, Sicilian Lemon', heart: 'Mediterranean Orchard Fruits', base: 'White Musk, Madagascar Vanilla, Amber',
    desc: 'Bright Sicilian orange, Calabrian bergamot and lemon open into a sun-ripened Mediterranean fruit heart, settling into a soft, creamy base of white musk, Madagascar vanilla and amber.',
    inspired: 'INSPIRED BY ERBA PURA · XERJOFF' },
  { id: 'oudor', name: 'OUDOR', no: 'No. 03', category: 'MEN',
    accent: 'rgba(220,175,120,0.9)', img: '/products/oudor.webp', box: '/products/oudor_box.webp',
    editorialTall: '/products/oudor_wood.webp', editorialWide: '/products/oudor_rocks.webp',
    tagline: 'raspberry over molten earth', top: 'Raspberry', heart: 'Birch, Amber, Benzoin', base: 'Guaiac Wood, Vetiver, Cedar, Musk, Moss, Patchouli, Tonka Bean, Vanilla',
    desc: 'A dark raspberry opening gives way to smoky birch, amber and benzoin, grounded in a dense, earthy base of guaiac wood, vetiver, cedar, musk, moss, patchouli, tonka bean and vanilla — dense, volcanic and long-lasting.',
    inspired: 'INSPIRED BY TERRONI · ORTO PARISI' },
];

class Component extends DCLogic {
  state = {
    slug: 'aether',
    liveProducts: {},
    liveSettings: {},
    cart: loadStoredCart(),
    justAdded: false,
    activeImageIdx: 0,
    cartOpen: false,
    checkoutStep: 'cart', // 'cart' | 'form' | 'placing' | 'done' | 'bankinfo'
    checkoutForm: defaultCheckoutForm(),
    checkoutError: null,
    voucherInput: '',
    appliedVoucher: null, // { code, discountPercent } | null
    voucherStatus: 'idle', // 'idle' | 'checking' | 'error'
    voucherError: null,
    detailOpen: null, // 'howToUse' | 'ingredients' | 'delivery' | null
    reviewsData: { average: null, count: 0, reviews: [] },
    reviewForm: { customerName: '', orderNumber: '', rating: 5, comment: '' },
    reviewStatus: 'idle', // 'idle' | 'sending' | 'done' | 'error'
    reviewError: null,
  };

  componentDidMount() {
    // Pretty URL (/product/aether) is primary; ?slug= is kept as a fallback
    // for any old links pointing at product.dc.html directly.
    const pathMatch = window.location.pathname.match(/\/product\/([^/]+)/);
    const fromPath = pathMatch ? decodeURIComponent(pathMatch[1]) : null;
    const fromQuery = new URLSearchParams(window.location.search).get('slug');
    const candidate = fromPath || fromQuery;
    const slug = CATALOG.some((p) => p.id === candidate) ? candidate : 'aether';
    this.setState({ slug });

    const viewed = CATALOG.find((p) => p.id === slug);
    fbTrack('ViewContent', {
      content_ids: [slug], content_type: 'product',
      content_name: viewed ? viewed.name : slug,
      value: this.priceFor(slug), currency: 'PKR',
    });

    fetch('/api/products')
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => {
        const map = {};
        for (const p of list) map[p.slug] = p;
        this.setState({ liveProducts: map });
        const current = map[slug];
        if (current) this.loadReviews(current.id);
      })
      .catch(() => {});

    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : {}))
      .then((s) => { if (s && Object.keys(s).length) this.setState({ liveSettings: s }); })
      .catch(() => {});
  }

  priceFor(id) {
    const live = this.state.liveProducts[id];
    return live ? live.price : PRICE;
  }
  // null means "no compare-at price" (admin left it blank) and must suppress
  // the strikethrough — distinct from "live data hasn't loaded yet", which
  // still shows the hardcoded fallback so nothing flashes empty on first paint.
  priceOldFor(id) {
    const live = this.state.liveProducts[id];
    if (live) return live.priceOld != null ? live.priceOld : null;
    return ORIGINAL_PRICE;
  }
  _stockFor(id) {
    const live = this.state.liveProducts[id];
    return live ? live.stock : Infinity;
  }
  _mergeProduct(p) {
    const live = this.state.liveProducts[p.id] || {};
    const category = live.category || p.category;
    return {
      ...p,
      dbId: live.id || null,
      img: live.imageUrl || p.img,
      box: live.hoverImageUrl || p.box,
      editorialTall: live.editorialTallImageUrl || p.editorialTall,
      editorialWide: live.editorialWideImageUrl || p.editorialWide,
      tagline: live.tagline || p.tagline,
      top: live.topNote || p.top,
      heart: live.heartNote || p.heart,
      base: live.baseNote || p.base,
      topList: noteList(live.topNote || p.top),
      heartList: noteList(live.heartNote || p.heart),
      baseList: noteList(live.baseNote || p.base),
      accordLabel: noteList(live.baseNote || p.base).slice(0, 2).map((n) => n.name).join(' & '),
      desc: live.description || p.desc,
      inspired: live.inspiredBy || p.inspired,
      concentration: live.concentration || null,
      longevity: live.longevity || DEFAULT_LONGEVITY,
      howToUse: live.howToUse || DEFAULT_HOW_TO_USE,
      ingredients: live.ingredients || null,
      category,
      categoryLabel: { MEN: 'Men', WOMEN: 'Women', UNISEX: 'Unisex' }[category] || 'Unisex',
    };
  }

  add(id) {
    const stock = this._stockFor(id);
    this.setState((s) => {
      const q = Math.min(stock, (s.cart[id] || 0) + 1);
      const cart = { ...s.cart, [id]: q };
      persistCart(cart);
      return { cart, justAdded: true, cartOpen: true };
    });
    clearTimeout(this._addT);
    this._addT = setTimeout(() => this.setState({ justAdded: false }), 1400);
    const p = CATALOG.find((x) => x.id === id);
    fbTrack('AddToCart', {
      content_ids: [id], content_type: 'product', content_name: p ? p.name : id,
      value: this.priceFor(id), currency: 'PKR',
    });
  }
  setQty(id, delta) {
    this.setState((s) => {
      const q = Math.max(0, Math.min(this._stockFor(id), (s.cart[id] || 0) + delta));
      const cart = { ...s.cart, [id]: q };
      persistCart(cart);
      return { cart };
    });
  }
  setCheckoutField(field, value) {
    this.setState((s) => ({ checkoutForm: { ...s.checkoutForm, [field]: value } }));
  }
  toggleDetail(key) {
    this.setState((s) => ({ detailOpen: s.detailOpen === key ? null : key }));
  }
  loadReviews(productId) {
    fetch('/api/reviews/product/' + productId)
      .then((r) => (r.ok ? r.json() : { average: null, count: 0, reviews: [] }))
      .then((data) => this.setState({ reviewsData: data }))
      .catch(() => {});
  }
  setReviewField(field, value) {
    this.setState((s) => ({ reviewForm: { ...s.reviewForm, [field]: value } }));
  }
  async submitReview() {
    const { customerName, orderNumber, rating, comment } = this.state.reviewForm;
    if (!customerName.trim() || !orderNumber.trim() || !comment.trim()) {
      this.setState({ reviewStatus: 'error', reviewError: 'Please fill in all fields.' });
      return;
    }
    const productId = (this.state.liveProducts[this.state.slug] || {}).id;
    if (!productId) {
      this.setState({ reviewStatus: 'error', reviewError: 'Please try again in a moment.' });
      return;
    }
    this.setState({ reviewStatus: 'sending', reviewError: null });
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId, orderNumber: orderNumber.trim(), customerName: customerName.trim(),
          rating: Number(rating), comment: comment.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to submit review.');
      this.setState({ reviewStatus: 'done', reviewForm: { customerName: '', orderNumber: '', rating: 5, comment: '' } });
    } catch (err) {
      this.setState({ reviewStatus: 'error', reviewError: err.message });
    }
  }
  async applyVoucher() {
    const code = this.state.voucherInput.trim();
    if (!code || this.state.voucherStatus === 'checking') return;
    this.setState({ voucherStatus: 'checking', voucherError: null });
    try {
      const voucher = await validateVoucher(code);
      this.setState({ appliedVoucher: voucher, voucherStatus: 'idle', voucherError: null });
    } catch (err) {
      this.setState({ appliedVoucher: null, voucherStatus: 'error', voucherError: err.message });
    }
  }
  async submitOrder() {
    const formError = validateCheckoutForm(this.state.checkoutForm);
    if (formError) {
      this.setState({ checkoutError: formError });
      return;
    }
    const items = Object.entries(this.state.cart)
      .filter(([, qty]) => qty > 0)
      .map(([slug, quantity]) => ({ slug, quantity }));
    if (!items.length) {
      this.setState({ checkoutError: 'Your cart is empty.' });
      return;
    }
    this.setState({ checkoutStep: 'placing', checkoutError: null });
    const { paymentMethod } = this.state.checkoutForm;
    const value = items.reduce((sum, it) => sum + this.priceFor(it.slug) * it.quantity, 0);
    try {
      const { order, fbEventId } = await placeOrder({
        form: this.state.checkoutForm, items,
        voucherCode: this.state.appliedVoucher ? this.state.appliedVoucher.code : undefined,
        fbEventSourceUrl: window.location.href,
      });
      // Shares the browser Pixel Purchase event's ID with the server's
      // Conversions API Purchase event (fired from POST /api/orders) — that's
      // what lets Meta de-dupe them into a single conversion instead of
      // counting it twice.
      fbTrack('Purchase', {
        content_ids: items.map((it) => it.slug), content_type: 'product',
        contents: items.map((it) => ({ id: it.slug, quantity: it.quantity })),
        num_items: items.reduce((sum, it) => sum + it.quantity, 0),
        value: value - (order.discountAmount || 0), currency: 'PKR',
      }, fbEventId);
      persistCart({ aether: 0, aria: 0, oudor: 0 });
      this.setState({
        checkoutStep: paymentMethod === 'BANK_TRANSFER' ? 'bankinfo' : 'done',
        cart: { aether: 0, aria: 0, oudor: 0 },
        checkoutForm: defaultCheckoutForm(),
        voucherInput: '', appliedVoucher: null, voucherStatus: 'idle', voucherError: null,
      });
    } catch (err) {
      this.setState({ checkoutStep: 'form', checkoutError: err.message });
    }
  }

  renderVals() {
    const merged = CATALOG.map((p) => this._mergeProduct(p));
    const current = merged.find((p) => p.id === this.state.slug) || merged[0];
    const gallery = [current.img, current.box, current.editorialTall, current.editorialWide];
    const cart = this.state.cart;
    const cartCount = cart.aether + cart.aria + cart.oudor;
    const cartSubtotal = merged.reduce((sum, p) => sum + (cart[p.id] || 0) * this.priceFor(p.id), 0);
    const cartLines = merged.filter((p) => cart[p.id] > 0).map((p) => ({
      name: p.name, img: p.img, price: PKR(this.priceFor(p.id)), qty: cart[p.id],
      lineTotal: PKR(cart[p.id] * this.priceFor(p.id)),
      inc: () => this.setQty(p.id, 1), dec: () => this.setQty(p.id, -1),
    }));
    const S = this.state.liveSettings;
    const deliveryChargeVal = S.deliveryCharge != null ? S.deliveryCharge : 280;
    const { discountPercent, discountAmount } = computeDiscount(cartSubtotal, this.state.appliedVoucher);
    const grandTotal = Math.max(0, cartSubtotal - discountAmount) + deliveryChargeVal;

    const { average, count: reviewCount, reviews: reviewList } = this.state.reviewsData;
    const reviewsList = reviewList.map((r) => ({
      customerName: r.customerName,
      starsDisplay: starsFor(r.rating),
      comment: r.comment,
      dateDisplay: new Date(r.createdAt).toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' }),
    }));

    return {
      logoSrc: S.logoUrl || '/products/infuso-logo.png',
      waLink: 'https://wa.me/' + (S.whatsappNumber || '923316841320'),
      waDisplay: '+' + (S.whatsappNumber || '923316841320').replace(/(\d{2})(\d{3})(\d{7})/, '$1 $2 $3'),
      facebookUrl: S.facebookUrl || 'https://www.facebook.com/profile.php?id=61590700033553&mibextid=wwXIfr&mibextid=wwXIfr',
      instagramUrl: S.instagramUrl || 'https://www.instagram.com/infuso.pk?igsh=MXYyaDh2bnM5em01cA%3D%3D&utm_source=qr',
      contactMailto: 'mailto:' + (S.contactEmail || 'sales@infuso.pk'),
      footerCopyright: S.footerCopyright || '© 2026 INFUSO',
      deliveryInfo: S.deliveryInfo || DEFAULT_DELIVERY_INFO,
      returnPolicy: S.returnPolicy || DEFAULT_RETURN_POLICY,
      notesOpen: this.state.detailOpen === 'notes',
      notesSign: this.state.detailOpen === 'notes' ? '−' : '+',
      toggleNotes: () => this.toggleDetail('notes'),
      howToUseOpen: this.state.detailOpen === 'howToUse',
      howToUseSign: this.state.detailOpen === 'howToUse' ? '−' : '+',
      toggleHowToUse: () => this.toggleDetail('howToUse'),
      ingredientsOpen: this.state.detailOpen === 'ingredients',
      ingredientsSign: this.state.detailOpen === 'ingredients' ? '−' : '+',
      toggleIngredients: () => this.toggleDetail('ingredients'),
      showIngredients: !!current.ingredients,
      deliveryOpen: this.state.detailOpen === 'delivery',
      deliverySign: this.state.detailOpen === 'delivery' ? '−' : '+',
      toggleDelivery: () => this.toggleDetail('delivery'),

      reviewsCount: reviewCount,
      reviewsHasAny: reviewCount > 0,
      reviewsAverageDisplay: average != null ? average.toFixed(1) : '—',
      reviewsAverageStars: average != null ? starsFor(Math.round(average)) : '',
      reviewsList,
      reviewForm: this.state.reviewForm,
      ratingOptions: [1, 2, 3, 4, 5].map((n) => ({
        select: () => this.setReviewField('rating', n),
        star: n <= this.state.reviewForm.rating ? '★' : '☆',
        color: n <= this.state.reviewForm.rating ? current.accent : 'rgba(240,235,226,0.3)',
      })),
      onReviewName: (e) => this.setReviewField('customerName', e.target.value),
      onReviewOrderNumber: (e) => this.setReviewField('orderNumber', e.target.value),
      onReviewComment: (e) => this.setReviewField('comment', e.target.value),
      submitReview: () => this.submitReview(),
      showReviewForm: this.state.reviewStatus !== 'done',
      showReviewDone: this.state.reviewStatus === 'done',
      reviewError: this.state.reviewStatus === 'error' ? this.state.reviewError : null,
      reviewSubmitLabel: this.state.reviewStatus === 'sending' ? 'SUBMITTING…' : 'SUBMIT REVIEW',
      reviewSubmitPointer: this.state.reviewStatus === 'sending' ? 'none' : 'auto',

      bankQrSrc: S.bankQrImageUrl || '/products/bank-qr.png',
      bankAccountName: S.bankAccountName || 'Minahil Asim',
      bankName: S.bankName || 'Bank Al Habib',
      bankAccountNumber: S.bankAccountNumber || '5648-1829-000802-01-2',
      bankIban: S.bankIban || 'PK24BAHL5648182900080201',
      cartCount,
      cartBadgeBg: cartCount > 0 ? 'rgba(150,220,235,0.95)' : 'rgba(240,235,226,0.25)',
      cartLines,
      cartEmpty: cartCount === 0,
      cartTotal: PKR(cartSubtotal),
      deliveryChargeDisplay: PKR(deliveryChargeVal),
      orderTotal: PKR(grandTotal),
      discountApplied: !!this.state.appliedVoucher,
      showVoucherInput: !this.state.appliedVoucher,
      appliedVoucherCode: this.state.appliedVoucher ? this.state.appliedVoucher.code : '',
      appliedVoucherPercent: discountPercent,
      discountAmountDisplay: PKR(discountAmount),
      voucherInput: this.state.voucherInput,
      onVoucherInput: (e) => this.setState({ voucherInput: e.target.value, voucherStatus: 'idle', voucherError: null }),
      applyVoucher: () => this.applyVoucher(),
      removeVoucher: () => this.setState({ appliedVoucher: null, voucherInput: '', voucherStatus: 'idle', voucherError: null }),
      voucherError: this.state.voucherError,
      voucherApplyLabel: this.state.voucherStatus === 'checking' ? 'CHECKING…' : 'APPLY',
      voucherApplyPointer: this.state.voucherStatus === 'checking' ? 'none' : 'auto',
      cartX: this.state.cartOpen ? '0' : '105%',
      cartOverlayOpacity: this.state.cartOpen ? 1 : 0,
      cartPointer: this.state.cartOpen ? 'auto' : 'none',
      openCart: () => this.setState({ cartOpen: true }),
      closeCart: () => this.setState((s) => ({ cartOpen: false, checkoutStep: (s.checkoutStep === 'done' || s.checkoutStep === 'bankinfo') ? 'cart' : s.checkoutStep })),

      showCartFooter: this.state.checkoutStep === 'cart',
      showCartSummary: this.state.checkoutStep === 'cart' && cartCount > 0,
      showFooterBlock: this.state.checkoutStep !== 'cart' || cartCount > 0,
      showCheckoutForm: this.state.checkoutStep === 'form' || this.state.checkoutStep === 'placing',
      showOrderDone: this.state.checkoutStep === 'done',
      showBankInfo: this.state.checkoutStep === 'bankinfo',
      checkoutForm: this.state.checkoutForm,
      checkoutError: this.state.checkoutError,
      codBorder: this.state.checkoutForm.paymentMethod === 'COD' ? 'rgba(219,204,166,0.7)' : 'rgba(240,235,226,0.25)',
      codBg: this.state.checkoutForm.paymentMethod === 'COD' ? 'rgba(219,204,166,0.12)' : 'transparent',
      codColor: this.state.checkoutForm.paymentMethod === 'COD' ? '#f0ebe2' : 'rgba(240,235,226,0.55)',
      bankBorder: this.state.checkoutForm.paymentMethod === 'BANK_TRANSFER' ? 'rgba(219,204,166,0.7)' : 'rgba(240,235,226,0.25)',
      bankBg: this.state.checkoutForm.paymentMethod === 'BANK_TRANSFER' ? 'rgba(219,204,166,0.12)' : 'transparent',
      bankColor: this.state.checkoutForm.paymentMethod === 'BANK_TRANSFER' ? '#f0ebe2' : 'rgba(240,235,226,0.55)',
      selectCOD: () => this.setCheckoutField('paymentMethod', 'COD'),
      selectBank: () => this.setCheckoutField('paymentMethod', 'BANK_TRANSFER'),
      submitLabel: this.state.checkoutStep === 'placing'
        ? 'PLACING ORDER…'
        : (this.state.checkoutForm.paymentMethod === 'BANK_TRANSFER' ? 'PLACE ORDER · BANK TRANSFER' : 'PLACE ORDER · COD'),
      submitPointer: this.state.checkoutStep === 'placing' ? 'none' : 'auto',
      openCheckoutForm: () => {
        this.setState({ checkoutStep: 'form', checkoutError: null });
        const inCart = merged.filter((p) => cart[p.id] > 0);
        fbTrack('InitiateCheckout', {
          content_ids: inCart.map((p) => p.id), content_type: 'product',
          contents: inCart.map((p) => ({ id: p.id, quantity: cart[p.id] })),
          num_items: cartCount, value: cartSubtotal, currency: 'PKR',
        });
      },
      backToCart: () => this.setState({ checkoutStep: 'cart', checkoutError: null }),
      onCustomerName: (e) => this.setCheckoutField('customerName', e.target.value),
      onCustomerEmail: (e) => this.setCheckoutField('customerEmail', e.target.value),
      onPhone: (e) => this.setCheckoutField('phone', e.target.value),
      onAddress: (e) => this.setCheckoutField('address', e.target.value),
      onCity: (e) => this.setCheckoutField('city', e.target.value),
      onNotes: (e) => this.setCheckoutField('notes', e.target.value),
      submitOrder: () => this.submitOrder(),

      product: {
        name: current.name, noNum: current.no.replace('No. ', ''), base: current.accordLabel,
        accent: current.accent, categoryLabel: current.categoryLabel,
        taglineCased: current.tagline.charAt(0).toUpperCase() + current.tagline.slice(1) + '.',
        desc: current.desc,
        topList: current.topList, heartList: current.heartList, baseList: current.baseList,
        hasHeartNotes: current.heartList.length > 0,
        inspired: current.inspired,
        concentration: current.concentration,
        hasConcentration: !!current.concentration,
        noConcentration: !current.concentration,
        longevity: current.longevity,
        howToUse: current.howToUse,
        ingredients: current.ingredients,
        mainImg: gallery[this.state.activeImageIdx] || current.img,
        gallery: gallery.map((src, i) => ({
          src,
          activeClass: this.state.activeImageIdx === i ? 'active' : '',
          select: () => this.setState({ activeImageIdx: i }),
        })),
        price: PKR(this.priceFor(current.id)),
        priceOld: this.priceOldFor(current.id) != null ? PKR(this.priceOldFor(current.id)) : null,
        btnBg: this.state.justAdded ? current.accent : 'rgba(255,255,255,0.02)',
        btnLabel: this.state.justAdded ? 'ADDED ✓' : 'ADD TO CART',
        add: () => this.add(current.id),
      },

      otherProducts: merged.filter((p) => p.id !== current.id).map((p) => ({
        name: p.name, img: p.img, hoverImg: p.box || p.img, categoryLabel: p.categoryLabel, tagline: p.tagline,
        price: PKR(this.priceFor(p.id)),
        priceOld: this.priceOldFor(p.id) != null ? PKR(this.priceOldFor(p.id)) : null,
        href: '/product/' + p.id,
      })),
    };
  }
}
