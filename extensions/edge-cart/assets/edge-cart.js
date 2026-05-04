/* ============================================================
   EdgeCart SideCart — Storefront JavaScript
   ============================================================ */
(function () {
  "use strict";

  /* ── Config injected by liquid ─────────────────────────── */
  var PROXY = window.EdgeCartProxy || "/apps/edge-cart";
  var SHOP  = window.EdgeCartShop  || "";

  /* ── State ─────────────────────────────────────────────── */
  var settings          = null;
  var cart              = null;
  var discountCode       = "";
  var appliedDiscount    = null;
  var discountLoading    = false;
  var discountError      = "";
  var discountSuccess    = false;
  var discountInputValue = ""; /* preserves typed code while footer re-renders */
  var orderNote         = "";
  var aiRecommendations       = [];
  var aiRecommendationsFetching = false;
  var aiSeedProductId         = null; /* cache key — refetch when seed changes */
  var freebieToastTimer = null;
  var isOpen            = false;
  var initialized       = false;
  var updatingKeys      = {};
  var freebieAutoSync   = false;
  var freebieRetryAt    = 0;    /* timestamp: don't retry before this */
  var ecHandlingAdd     = false;
  var scarcityTimer     = null;

  /* ===========================================================
     BOOT
  =========================================================== */
  function boot() {
    Promise.all([loadSettings(), loadCart()])
      .then(function (results) {
        settings = results[0];
        cart     = results[1];
        if (!settings || !settings.enabled) return;
        injectDynamicCSS();
        injectCustomCode();
        buildDOM();
        attachGlobalListeners();
        initialized = true;
        if (settings.autoDiscountEnabled && settings.autoDiscountCode) {
          applyDiscount(settings.autoDiscountCode);
        }
        syncFreebie();
      })
      .catch(function (err) {
        console.warn("[EdgeCart] init error:", err);
      });
  }

  /* ===========================================================
     API CALLS
  =========================================================== */
  function loadSettings() {
    return fetch(PROXY + "/api/cart-settings", { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  function loadCart() {
    return fetch("/cart.js", { credentials: "same-origin" })
      .then(function (r) { return r.json(); });
  }

  function cartAdd(variantId, quantity, properties) {
    ecHandlingAdd = true;
    return fetch("/cart/add.js", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      credentials: "same-origin",
      body: JSON.stringify({ id: variantId, quantity: quantity || 1, properties: properties || {} }),
    }).then(function (r) {
      ecHandlingAdd = false;
      if (!r.ok) return r.json().then(function (e) { throw new Error(e.description || "Add failed"); });
      return loadCart().then(function (c) { cart = c; document.dispatchEvent(new CustomEvent('cart:updated')); });
    }).catch(function (err) {
      ecHandlingAdd = false;
      throw err;
    });
  }

  function cartChange(key, quantity) {
    return fetch("/cart/change.js", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      credentials: "same-origin",
      body: JSON.stringify({ id: key, quantity: quantity }),
    }).then(function (r) {
      if (!r.ok) return r.json().then(function (e) { throw new Error(e.description || "Change failed"); });
      return r.json().then(function (c) { cart = c; document.dispatchEvent(new CustomEvent('cart:updated')); });
    });
  }

  function cartUpdateNote(note) {
    return fetch("/cart/update.js", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      credentials: "same-origin",
      body: JSON.stringify({ note: note }),
    }).then(function (r) { return r.json(); });
  }

  /* Returns Shopify's own discount total from /cart.js — never calculated manually. */
  function discountSavings() {
    if (!cart || !appliedDiscount) return 0;
    return cart.total_discount || 0;
  }

  /* Applies /discount/CODE in a hidden iframe — a real page navigation that makes
     Shopify set its session cookie. /cart.js then returns the correct post-discount
     total_price, original_total_price, and total_discount automatically. */
  function applyDiscountSession(code) {
    return new Promise(function (resolve) {
      var done = false, timer = null;
      function finish() {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (frame && frame.parentNode) frame.parentNode.removeChild(frame);
        setTimeout(resolve, 120); /* brief pause for cookie commit */
      }
      var frame = document.createElement("iframe");
      frame.setAttribute("aria-hidden", "true");
      frame.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;";
      frame.onload  = finish;
      frame.onerror = finish;
      timer = setTimeout(finish, 5000);
      document.body.appendChild(frame);
      frame.src = "/discount/" + encodeURIComponent(code);
    });
  }

  /* Step 1 — validate via Shopify Admin GraphQL to surface exact error messages.
     Step 2 — apply via /discount/CODE so Shopify's session cookie is set.
     Step 3 — reload /cart.js; Shopify returns all discount numbers, nothing is calculated here. */
  async function applyDiscount(code) {
    code = (code || "").trim();
    if (!code) { clearDiscount(); return; }

    var upperCode = code.toUpperCase();
    if (discountCode === upperCode && appliedDiscount && !discountError) return;

    discountInputValue = code;
    discountLoading    = true;
    discountError      = "";
    if (isOpen) renderFooter();

    try {
      var res;
      try {
        res = await fetch(
          PROXY + "/api/validate-discount?code=" + encodeURIComponent(code),
          { credentials: "same-origin" }
        );
      } catch (_) {
        throw new Error("Network error — please check your connection");
      }

      var data;
      try { data = res.ok ? await res.json() : null; } catch (_) { data = null; }
      if (!data) data = { valid: false, reason: "Could not reach validation server" };

      if (!data.valid) {
        discountCode    = "";
        appliedDiscount = null;
        discountError   = data.reason || "Invalid discount code";
        discountLoading = false;
        if (isOpen) renderFooter();
        return;
      }

      /* Let Shopify apply and calculate everything */
      await applyDiscountSession(upperCode);
      cart               = await loadCart();
      discountCode       = upperCode;
      appliedDiscount    = data;
      discountError      = "";
      discountLoading    = false;
      discountInputValue = "";
      discountSuccess    = true;
      if (isOpen) render();
      setTimeout(function () {
        discountSuccess = false;
        if (isOpen) renderFooter();
      }, 3000);

    } catch (err) {
      discountLoading    = false;
      discountError      = err.message || "Could not apply discount. Please try again.";
      appliedDiscount    = null;
      discountCode       = "";
      discountInputValue = "";
      if (isOpen) renderFooter();
    }
  }

  /* Remove the applied discount code from UI and state.
     discountSavings() returns 0 when appliedDiscount is null, so the summary
     correctly shows no savings even if a Shopify session cookie lingers.
     The checkout URL loses ?discount=CODE, so checkout won't use the code. */
  async function clearDiscount() {
    discountCode       = "";
    appliedDiscount    = null;
    discountError      = "";
    discountSuccess    = false;
    discountInputValue = "";
    if (isOpen) render();
    try {
      cart = await loadCart();
      if (isOpen) render();
    } catch (_) {}
  }

  function buildDOM() {
    var overlay = make("div", "ec-overlay");
    overlay.id  = "ec-overlay";
    on(overlay, "click", closeCart);

    var drawer = make("div", "ec-cart");
    drawer.id  = "ec-cart";
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-modal", "true");
    drawer.setAttribute("aria-label", "Shopping cart");

    drawer.innerHTML = [
      '<div class="ec-inner">',
        '<div class="ec-freebie-toast" id="ec-freebie-toast" aria-live="polite"></div>',
        '<div class="ec-banner" id="ec-banner"></div>',
        '<div class="ec-scarcity" id="ec-scarcity" style="display:none"></div>',
        '<div class="ec-rewards" id="ec-rewards" style="display:none"></div>',
        '<div class="ec-header">',
          '<h2 class="ec-header__title" id="ec-header-title"></h2>',
          '<button class="ec-header__close" id="ec-close" aria-label="Close cart">',
            svgClose(),
          '</button>',
        '</div>',
        '<div class="ec-body" id="ec-body"></div>',
        '<div class="ec-footer" id="ec-footer"></div>',
      '</div>',
    ].join("");

    document.body.appendChild(overlay);
    document.body.appendChild(drawer);

    on(drawer, "click", handleDrawerClick);
    on(id("ec-close"), "click", closeCart);
  }

  /* ===========================================================
     RENDER
  =========================================================== */
  function render() {
    renderBanner();
    renderScarcity();
    renderRewards();
    renderHeader();
    renderBody();
    renderFooter();
    syncCartBadges();
  }

  function renderBanner() {
    var el = id("ec-banner");
    if (!el || !settings) return;
    if (settings.bannerEnabled && settings.bannerText) {
      el.textContent      = settings.bannerText;
      el.style.display    = "";
      el.style.background = settings.bannerBgColor || "#1a1a1a";
      el.style.color      = settings.bannerTextColor || "#fff";
    } else {
      el.style.display = "none";
    }
  }

  /* ── Scarcity countdown ─────────────────────────────────── */
  function renderScarcity() {
    var el = id("ec-scarcity");
    if (!el || !settings || !settings.scarcityEnabled) {
      if (el) el.style.display = "none";
      return;
    }
    el.style.display    = "";
    el.style.background = settings.scarcityBgColor || "#e53e3e";
    el.style.color      = settings.scarcityTextColor || "#fff";

    var storageKey = "ec_timer_" + SHOP;
    var stored     = sessionStorage.getItem(storageKey);
    var endTime;

    if (stored) {
      endTime = parseInt(stored, 10);
    } else {
      endTime = Date.now() + (settings.scarcityMinutes || 15) * 60 * 1000;
      sessionStorage.setItem(storageKey, String(endTime));
    }

    function tick() {
      var remaining = Math.max(0, endTime - Date.now());
      var totalSec  = Math.floor(remaining / 1000);
      var h = Math.floor(totalSec / 3600);
      var m = Math.floor((totalSec % 3600) / 60);
      var s = totalSec % 60;
      var timeStr = h > 0
        ? pad(h) + ":" + pad(m) + ":" + pad(s)
        : pad(m) + ":" + pad(s);

      el.innerHTML = [
        '<span class="ec-scarcity__text">' + esc(settings.scarcityText || "⏰ Offer ends in:") + '</span>',
        '<span class="ec-scarcity__clock">' + (remaining > 0 ? timeStr : "EXPIRED") + '</span>',
      ].join(" ");
    }

    tick();
    if (scarcityTimer) clearInterval(scarcityTimer);
    scarcityTimer = setInterval(tick, 1000);
  }

  function pad(n) { return String(n).padStart(2, "0"); }

  /* ── Tiered rewards — milestone bar ───────────────────────── */
  function renderRewards() {
    var el = id("ec-rewards");
    if (!el || !settings || !settings.tieredRewardsEnabled) {
      if (el) el.style.display = "none";
      return;
    }

    var tiers = settings.tieredRewards || [];
    if (!tiers.length) { el.style.display = "none"; return; }

    tiers = tiers.slice().sort(function (a, b) { return a.threshold - b.threshold; });
    el.style.display = "";

    var cartValue  = cart ? (cart.total_price / 100) : 0;
    var cartQty    = cart ? cart.item_count : 0;
    var maxTier    = tiers[tiers.length - 1];
    var maxVal     = maxTier.threshold;
    var useQty     = tiers[0].thresholdType === "quantity";
    var currentVal = useQty ? cartQty : cartValue;

    var nextTier = null;
    for (var i = 0; i < tiers.length; i++) {
      if (currentVal < tiers[i].threshold) { nextTier = tiers[i]; break; }
    }

    var msg;
    if (!nextTier) {
      msg = "🎉 All rewards unlocked!";
    } else {
      var rem    = nextTier.threshold - currentVal;
      var remFmt = useQty
        ? Math.ceil(rem) + " item" + (Math.ceil(rem) !== 1 ? "s" : "")
        : money(Math.max(0, rem) * 100);
      var rewardName = nextTier.unlockedLabel || nextTier.label || "next reward";
      msg = "Add More Worth " + remFmt + " for " + rewardName;
    }

    var fillPct = maxVal > 0 ? Math.min(100, Math.round((currentVal / maxVal) * 100)) : 100;

    var nodesHTML = tiers.map(function (tier) {
      var unlocked  = currentVal >= tier.threshold;
      var pct       = maxVal > 0 ? Math.round((tier.threshold / maxVal) * 100) : 100;
      var threshFmt = useQty
        ? tier.threshold + (tier.threshold === 1 ? " item" : " items")
        : money(tier.threshold * 100);
      var milLabel  = tier.unlockedLabel || tier.label || threshFmt;
      var isGift    = /free|gift|product/i.test(milLabel);
      return [
        '<div class="ec-rw__node' + (unlocked ? ' ec-rw__node--done' : '') + '" style="left:' + pct + '%">',
          '<span class="ec-rw__price">' + esc(threshFmt) + '</span>',
          '<div class="ec-rw__dot">' + (isGift ? svgRwGift(unlocked) : svgRwTag(unlocked)) + '</div>',
          '<span class="ec-rw__lbl">' + esc(milLabel) + '</span>',
        '</div>',
      ].join("");
    }).join("");

    el.innerHTML = [
      '<div class="ec-rw__inner">',
        '<p class="ec-rw__msg">' + esc(msg) + '</p>',
        '<div class="ec-rw__stage">',
          '<div class="ec-rw__bar"><div class="ec-rw__fill" style="width:' + fillPct + '%"></div></div>',
          nodesHTML,
        '</div>',
      '</div>',
    ].join("");
  }

  function renderHeader() {
    var el = id("ec-header-title");
    if (el && settings) el.textContent = settings.headerText || "Your Cart";
  }

  function renderBody() {
    var body = id("ec-body");
    if (!body) return;

    if (!cart || cart.item_count === 0) {
      body.innerHTML = [
        '<div class="ec-empty">',
          svgCart("ec-empty__icon"),
          '<p class="ec-empty__text">Your cart is empty</p>',
          '<p class="ec-empty__sub">Add items to get started</p>',
          '<button class="ec-empty__btn" id="ec-keep-shopping">Continue Shopping</button>',
        '</div>',
      ].join("");
      on(id("ec-keep-shopping"), "click", closeCart);
      return;
    }

    body.innerHTML = '<div class="ec-items" id="ec-items">' + cart.items.map(renderItem).join("") + '</div>';
  }

  function isFreebieItem(item) {
    if (!settings || !settings.freebieProductVariantId) return false;
    var numId = extractId(settings.freebieProductVariantId);
    return String(item.variant_id) === numId ||
      (item.properties && item.properties._edge_cart_freebie === "true");
  }

  function renderItem(item) {
    var freebie = isFreebieItem(item);
    var img = (item.featured_image && item.featured_image.url)
      ? item.featured_image.url
      : (item.image || (freebie ? (settings.freebieProductImageUrl || "") : ""));
    var hasDisc = item.line_price < item.original_line_price;
    var isUpd   = updatingKeys[item.key];
    var showVar = settings.showVariantTitle !== false;

    return [
      '<div class="ec-item' + (isUpd ? " ec-item--updating" : "") + (freebie ? " ec-item--freebie" : "") + '" data-key="' + esc(item.key) + '">',
        '<div class="ec-item__img">',
          img
            ? '<img src="' + esc(img) + '" alt="' + esc(item.product_title) + '" loading="lazy">'
            : '<div class="ec-item__img-placeholder"></div>',
        '</div>',
        '<div class="ec-item__body">',
          '<div class="ec-item__top">',
            '<div class="ec-item__info">',
              '<p class="ec-item__title">' + esc(item.product_title) + '</p>',
              showVar && item.variant_title && item.variant_title !== "Default Title"
                ? '<p class="ec-item__variant">' + esc(item.variant_title) + '</p>'
                : "",
            '</div>',
            freebie
              ? '<span class="ec-item__free-badge">FREE</span>'
              : '<button class="ec-item__remove" data-action="remove" data-key="' + esc(item.key) + '" aria-label="Remove">' + svgX() + '</button>',
          '</div>',
          '<div class="ec-item__bottom">',
            freebie
              ? '<span class="ec-item__gift-label">🎁 Free Gift</span>'
              : [
                '<div class="ec-qty">',
                  '<button class="ec-qty__btn" data-action="dec" data-key="' + esc(item.key) + '" data-qty="' + (item.quantity - 1) + '" aria-label="Decrease"' + (item.quantity <= 1 ? " disabled" : "") + '>−</button>',
                  '<span class="ec-qty__val">' + item.quantity + '</span>',
                  '<button class="ec-qty__btn" data-action="inc" data-key="' + esc(item.key) + '" data-qty="' + (item.quantity + 1) + '" aria-label="Increase">+</button>',
                '</div>',
              ].join(""),
            '<div class="ec-item__price">',
              freebie
                ? '<span class="ec-item__line ec-item__line--free">$0.00</span>'
                : [
                  hasDisc ? '<span class="ec-item__orig">' + money(item.original_line_price) + '</span>' : "",
                  '<span class="ec-item__line' + (hasDisc ? " ec-item__line--sale" : "") + '">' + money(item.line_price) + '</span>',
                ].join(""),
            '</div>',
          '</div>',
        '</div>',
      '</div>',
    ].join("");
  }

  function renderFooter() {
    var footer = id("ec-footer");
    if (!footer || !cart || cart.item_count === 0) {
      if (footer) footer.innerHTML = "";
      return;
    }

    /* Use Shopify's own numbers from /cart.js — nothing is calculated here.
       total_price is post-discount; original_total_price is pre-discount. */
    var savings    = discountSavings();
    var subtotal   = savings > 0 ? cart.original_total_price : cart.total_price;
    var finalTotal = cart.total_price;
    var html = "";

    /* Freebie */
    if (settings.freebieEnabled) html += buildFreebieHTML();

    /* Static upsell */
    if (settings.upsellEnabled) html += buildUpsellHTML();

    /* AI upsell (Shopify Recommendations API) */
    if (settings.aiUpsellEnabled) html += buildAiUpsellHTML();

    /* Discount */
    if (settings.discountEnabled) {
      var isApplied = !!(appliedDiscount && discountCode);
      if (isApplied) {
        var labelText = savings > 0
          ? "You save " + money(savings) + "!"
          : appliedDiscount.type === "free_shipping" ? "Free shipping applied!"
          : appliedDiscount.type === "bxgy" ? (appliedDiscount.description || "Buy X Get Y applied!")
          : "Applied at checkout";
        var savingsLabel = '<span class="ec-discount__saving' + (savings > 0 ? '' : ' ec-discount__saving--info') + '">' + esc(labelText) + '</span>';
        html += [
          '<div class="ec-discount">',
            '<div class="ec-discount__applied-row">',
              '<span class="ec-discount__tag">',
                '🏷 ' + esc(discountCode),
                '<button class="ec-discount__remove" data-action="discount-remove" aria-label="Remove discount">×</button>',
              '</span>',
              savingsLabel,
            '</div>',
            discountSuccess ? '<p class="ec-discount__success" aria-live="polite">✓ Discount applied!</p>' : '',
          '</div>',
        ].join("");
      } else {
        html += [
          '<div class="ec-discount">',
            '<label class="ec-discount__label" for="ec-disc-input">Discount code or gift card</label>',
            '<div class="ec-discount__wrap">',
              '<input class="ec-discount__input" id="ec-disc-input" type="text" ',
                'placeholder="Enter code" ',
                'value="' + esc(discountInputValue) + '" ',
                'autocomplete="off" spellcheck="false" ',
                'aria-label="Discount code or gift card"' + (discountLoading ? ' disabled' : '') + '>',
              '<button class="ec-discount__apply" id="ec-disc-apply"' + (discountLoading || !discountInputValue.trim() ? ' disabled' : '') + '>',
                discountLoading ? 'Applying…' : 'Apply',
              '</button>',
            '</div>',
            discountLoading
              ? '<p class="ec-discount__msg" aria-live="polite">Checking discount…</p>'
              : discountError
                ? '<p class="ec-discount__error" role="alert" aria-live="assertive">✗ ' + esc(discountError) + '</p>'
                : '',
          '</div>',
        ].join("");
      }
    }

    /* Order Notes */
    if (settings.orderNotesEnabled) {
      html += [
        '<div class="ec-notes">',
          '<label class="ec-notes__label" for="ec-note-input">Order Notes</label>',
          '<textarea class="ec-notes__textarea" id="ec-note-input" rows="2" ',
            'placeholder="Add a note to your order…">',
            esc(orderNote),
          '</textarea>',
        '</div>',
      ].join("");
    }

    /* Summary */
    html += [
      '<div class="ec-summary">',
        savings > 0 ? [
          '<div class="ec-summary__row">',
            '<span class="ec-summary__label">Subtotal</span>',
            '<span class="ec-summary__price ec-summary__price--struck">' + money(subtotal) + '</span>',
          '</div>',
          '<div class="ec-summary__row ec-summary__row--savings">',
            '<span class="ec-summary__label">Discount (' + esc(discountCode) + ')</span>',
            '<span class="ec-summary__savings">−' + money(savings) + '</span>',
          '</div>',
          '<div class="ec-summary__row">',
            '<span class="ec-summary__label ec-summary__label--total">Total</span>',
            '<span class="ec-summary__price">' + money(finalTotal) + '</span>',
          '</div>',
        ].join("") : [
          '<div class="ec-summary__row">',
            '<span class="ec-summary__label">Subtotal</span>',
            '<span class="ec-summary__price">' + money(subtotal) + '</span>',
          '</div>',
        ].join(""),
        '<p class="ec-summary__note">Taxes & shipping calculated at checkout</p>',
      '</div>',
      '<button class="ec-checkout-btn" id="ec-checkout">',
        'Checkout · ' + money(finalTotal),
      '</button>',
    ].join("");

    footer.innerHTML = html;

    /* Bind discount input */
    var applyBtn  = id("ec-disc-apply");
    var discInput = id("ec-disc-input");
    if (applyBtn && discInput) {
      /* Track typed value so it survives re-renders (e.g. during loading) */
      on(discInput, "input", function () {
        discountInputValue = discInput.value;
        if (applyBtn) applyBtn.disabled = !discInput.value.trim();
      });
      on(applyBtn, "click", function () { applyDiscount(discInput.value.trim()); });
      on(discInput, "keydown", function (e) {
        if (e.key === "Enter") applyDiscount(discInput.value.trim());
      });
    }

    /* Bind order note */
    var noteInput = id("ec-note-input");
    if (noteInput) {
      on(noteInput, "input", function () { orderNote = noteInput.value; });
    }

    /* Bind checkout */
    var checkoutBtn = id("ec-checkout");
    if (checkoutBtn) on(checkoutBtn, "click", handleCheckout);
  }

  function handleCheckout() {
    var btn = id("ec-checkout");
    if (btn) { btn.disabled = true; btn.textContent = "Loading…"; }
    function go() { window.location.href = checkoutUrl(); }
    if (settings.orderNotesEnabled && orderNote.trim()) {
      cartUpdateNote(orderNote.trim()).then(go).catch(go);
    } else {
      go();
    }
  }

  /* ── Freebie toast popup ───────────────────────────────── */
  function showFreebieToast() {
    var toast = id("ec-freebie-toast");
    if (!toast) return;
    toast.textContent = settings.freebieTitle || "🎁 Free gift added to your cart!";
    toast.classList.add("ec-freebie-toast--visible");
    if (freebieToastTimer) clearTimeout(freebieToastTimer);
    freebieToastTimer = setTimeout(function () {
      toast.classList.remove("ec-freebie-toast--visible");
      freebieToastTimer = null;
    }, 3500);

    if (settings.freebieConfettiEnabled !== false) {
      launchConfetti();
    }
  }

  /* ── Confetti ──────────────────────────────────────────── */
  function launchConfetti() {
    var canvas = document.createElement("canvas");
    canvas.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2147483646;";
    document.body.appendChild(canvas);
    var ctx = canvas.getContext("2d");
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

    var colors   = ["#f59e0b", "#22c55e", "#3b82f6", "#ec4899", "#8b5cf6", "#ef4444", "#06b6d4"];
    var particles = [];
    for (var i = 0; i < 90; i++) {
      particles.push({
        x:    Math.random() * canvas.width,
        y:    -20 - Math.random() * 120,
        w:    7 + Math.random() * 8,
        h:    3 + Math.random() * 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        vx:   (Math.random() - 0.5) * 4,
        vy:   2.5 + Math.random() * 4,
        rot:  Math.random() * 360,
        rotV: (Math.random() - 0.5) * 7,
        opacity: 1,
      });
    }

    var start    = Date.now();
    var duration = 2800;

    function frame() {
      var elapsed = Date.now() - start;
      if (elapsed > duration) { canvas.remove(); return; }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      var fadeStart = duration - 600;
      particles.forEach(function (p) {
        p.x   += p.vx;
        p.y   += p.vy;
        p.rot += p.rotV;
        p.vy  += 0.09;
        if (elapsed > fadeStart) {
          p.opacity = Math.max(0, 1 - (elapsed - fadeStart) / 600);
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot * Math.PI / 180);
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle   = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ── Freebie HTML ──────────────────────────────────────── */
  function buildFreebieHTML() {
    if (!settings.freebieProductVariantId) return "";

    var numId    = extractId(settings.freebieProductVariantId);
    var inCart   = cart.items.some(function (i) { return String(i.variant_id) === numId; });
    var unlocked = checkFreebie();

    /* In cart already — it shows as a styled green line item */
    if (inCart) {
      /* Threshold no longer met — trigger removal on every render pass */
      if (!unlocked && !freebieAutoSync) syncFreebie();
      return "";
    }

    /* Threshold met — auto-add silently in background; toast appears when done */
    if (unlocked) {
      if (!freebieAutoSync && Date.now() >= freebieRetryAt) {
        syncFreebie();
      }
      return "";
    }

    /* Locked — show progress bar only */
    var prog = freebieProgress();
    if (!prog || !prog.msg) return "";
    return [
      '<div class="ec-freebie ec-freebie--locked">',
        '<p class="ec-freebie__msg">' + esc(prog.msg) + '</p>',
        '<div class="ec-freebie__bar-track">',
          '<div class="ec-freebie__bar-fill" style="width:' + prog.pct + '%"></div>',
        '</div>',
      '</div>',
    ].join("");
  }

  /* ── Freebie auto-sync ─────────────────────────────────── */
  function syncFreebie() {
    if (freebieAutoSync) return;
    if (!settings || !settings.freebieEnabled || !settings.freebieProductVariantId) return;
    if (!cart) return;

    var numId       = extractId(settings.freebieProductVariantId);
    var freebieItem = cart.items.find(function (i) { return String(i.variant_id) === numId; });
    var realItems   = cart.items.filter(function (i) { return String(i.variant_id) !== numId; });

    /* Empty cart with no freebie — nothing to do */
    if (!freebieItem && realItems.length === 0) return;

    var unlocked = checkFreebie();

    if (unlocked && !freebieItem) {
      /* Respect cooldown period after a failed add */
      if (Date.now() < freebieRetryAt) return;

      freebieAutoSync = true;
      cartAdd(numId, 1, { _edge_cart_freebie: "true" })
        .then(function () {
          freebieAutoSync = false;
          freebieRetryAt  = 0;
          showFreebieToast();
          syncFreebie();
          if (isOpen) render();
          syncCartBadges();
        })
        .catch(function (err) {
          freebieAutoSync = false;
          freebieRetryAt  = 0; /* retry immediately on next sync */
          console.warn("[EdgeCart] Freebie auto-add failed:", err.message || err);
          /* Don't re-render — no UI change needed */
        });

    } else if (!unlocked && freebieItem) {
      freebieAutoSync = true;
      cartChange(freebieItem.key, 0)
        .then(function () {
          freebieAutoSync = false;
          freebieRetryAt  = 0;
          syncFreebie();
          if (isOpen) render();
          syncCartBadges();
        })
        .catch(function (err) {
          freebieAutoSync = false;
          console.warn("[EdgeCart] Freebie auto-remove failed:", err.message || err);
        });
    }
  }

  /* ── Upsell HTML — horizontal scroll carousel ──────────── */
  function buildUpsellHTML() {
    var products = settings.upsellProducts || [];
    if (!products.length || !checkUpsell()) return "";

    var cartPids = cart.items.map(function (i) { return "gid://shopify/Product/" + i.product_id; });
    var toShow   = products.filter(function (p) { return cartPids.indexOf(p.id) === -1; });
    if (!toShow.length) return "";

    var cards = toShow.map(function (p) {
      var v   = p.variants && p.variants[0];
      if (!v) return "";
      var vid   = extractId(v.id);
      var price = v.price ? moneyVal(parseFloat(v.price) * 100) : "";
      var img   = p.featuredImage && p.featuredImage.url ? p.featuredImage.url : "";
      return [
        '<div class="ec-upsell-card">',
          img
            ? '<img class="ec-upsell-card__img" src="' + esc(img) + '" alt="' + esc(p.title) + '" loading="lazy">'
            : '<div class="ec-upsell-card__img-placeholder"></div>',
          '<div class="ec-upsell-card__body">',
            '<p class="ec-upsell-card__name">' + esc(p.title) + '</p>',
            price ? '<p class="ec-upsell-card__price">' + price + '</p>' : "",
          '</div>',
          '<button class="ec-upsell-card__add" data-action="upsell" data-variant="' + esc(vid) + '" aria-label="Add ' + esc(p.title) + '">+ Add</button>',
        '</div>',
      ].join("");
    }).join("");

    if (!cards) return "";
    return [
      '<div class="ec-upsell-wrap">',
        '<p class="ec-upsell-wrap__heading">' + esc(settings.upsellTitle || "You might also like") + '</p>',
        '<div class="ec-upsell-track">' + cards + '</div>',
      '</div>',
    ].join("");
  }

  /* ── AI Upsell — Shopify Recommendations API ────────────── */
  async function fetchAiRecommendations() {
    if (!settings || !settings.aiUpsellEnabled) { aiRecommendations = []; return; }
    if (!cart || !cart.items.length)             { aiRecommendations = []; return; }
    if (aiRecommendationsFetching) return;

    /* Seed: non-freebie item with highest line price */
    var freebieId = settings.freebieProductVariantId ? extractId(settings.freebieProductVariantId) : null;
    var seed = null;
    cart.items.forEach(function (item) {
      if (freebieId && String(item.variant_id) === freebieId) return;
      if (!seed || item.line_price > seed.line_price) seed = item;
    });
    if (!seed) { aiRecommendations = []; return; }

    /* Cache hit — same seed product, skip refetch */
    if (aiSeedProductId === seed.product_id && aiRecommendations.length) return;

    aiRecommendationsFetching = true;
    try {
      var limit  = Math.min(Math.max(parseInt(settings.aiUpsellLimit) || 4, 2), 8);
      var intent = settings.aiUpsellIntent === "complementary" ? "complementary" : "related";
      var url    = "/recommendations/products.json?product_id=" + seed.product_id +
                   "&limit=" + limit + "&intent=" + intent;
      var res    = await fetch(url, { credentials: "same-origin" });
      if (!res.ok) { aiRecommendations = []; return; }
      var data   = await res.json();
      var cartPids = cart.items.map(function (i) { return i.product_id; });
      aiRecommendations = (data.products || []).filter(function (p) {
        return cartPids.indexOf(p.id) === -1;
      });
      aiSeedProductId = seed.product_id;
    } catch (_) {
      aiRecommendations = [];
    } finally {
      aiRecommendationsFetching = false;
    }
    if (isOpen) renderFooter();
  }

  function buildAiUpsellHTML() {
    if (!settings.aiUpsellEnabled || !aiRecommendations.length) return "";

    var cartPids = cart.items.map(function (i) { return i.product_id; });
    var limit    = Math.min(Math.max(parseInt(settings.aiUpsellLimit) || 4, 2), 8);
    var toShow   = aiRecommendations.filter(function (p) { return cartPids.indexOf(p.id) === -1; }).slice(0, limit);
    if (!toShow.length) return "";

    var cards = toShow.map(function (p) {
      var v = p.variants && p.variants[0];
      if (!v) return "";
      /* Recommendations API returns featured_image as a string URL */
      var img   = (typeof p.featured_image === "string" ? p.featured_image : "")
               || (p.images && p.images[0] && p.images[0].src) || "";
      var price = v.price ? moneyVal(parseFloat(v.price) * 100) : "";
      return [
        '<div class="ec-upsell-card">',
          img
            ? '<img class="ec-upsell-card__img" src="' + esc(img) + '" alt="' + esc(p.title) + '" loading="lazy">'
            : '<div class="ec-upsell-card__img-placeholder"></div>',
          '<div class="ec-upsell-card__body">',
            '<p class="ec-upsell-card__name">' + esc(p.title) + '</p>',
            price ? '<p class="ec-upsell-card__price">' + price + '</p>' : "",
          '</div>',
          '<button class="ec-upsell-card__add" data-action="upsell" data-variant="' + esc(String(v.id)) + '" aria-label="Add ' + esc(p.title) + '">+ Add</button>',
        '</div>',
      ].join("");
    }).join("");

    if (!cards) return "";
    return [
      '<div class="ec-upsell-wrap ec-upsell-wrap--ai">',
        '<p class="ec-upsell-wrap__heading">',
          '<span class="ec-upsell-wrap__ai-badge">&#10022; AI</span> ' + esc(settings.aiUpsellTitle || "Customers Also Bought"),
        '</p>',
        '<div class="ec-upsell-track">' + cards + '</div>',
      '</div>',
    ].join("");
  }

  /* ===========================================================
     THRESHOLD CHECKS
  =========================================================== */
  function checkFreebie() {
    if (!cart) return false;
    var t   = settings.freebieTriggerType;
    var fid = settings.freebieProductVariantId ? extractId(settings.freebieProductVariantId) : null;

    var productIds = (settings.freebieTriggerProductIds || []).map(function (p) {
      return extractId(typeof p === "object" ? p.id : p);
    });
    var hasProductCond = productIds.length > 0;

    function productMet() {
      return cart.items.some(function (i) {
        return String(i.variant_id) !== fid && productIds.indexOf(String(i.product_id)) !== -1;
      });
    }

    /* "product" trigger = only product/collection condition */
    if (t === "product") return productMet();

    /* Primary condition */
    var primaryMet = false;
    if (t === "cartValue") {
      var total = cart.total_price / 100;
      primaryMet = total >= settings.freebieMinCartValue &&
                   (!settings.freebieMaxCartValue || total <= settings.freebieMaxCartValue);
    } else if (t === "quantity") {
      var qty = cart.items.reduce(function (sum, i) {
        return String(i.variant_id) === fid ? sum : sum + i.quantity;
      }, 0);
      primaryMet = qty >= settings.freebieMinQuantity &&
                   (!settings.freebieMaxQuantity || qty <= settings.freebieMaxQuantity);
    }

    /* No product condition configured — primary alone decides */
    if (!hasProductCond) return primaryMet;

    /* Combine with AND / OR */
    var logic = settings.freebieConditionLogic || "AND";
    return logic === "OR" ? primaryMet || productMet() : primaryMet && productMet();
  }

  function freebieProgress() {
    if (!cart) return null;
    var t   = settings.freebieTriggerType;
    var fid = settings.freebieProductVariantId ? extractId(settings.freebieProductVariantId) : null;

    if (t === "cartValue") {
      var cur    = cart.total_price / 100;
      var target = settings.freebieMinCartValue;
      var max    = settings.freebieMaxCartValue;
      if (max && cur > max) {
        return { pct: 100, msg: "Free gift available for orders up to " + moneyVal(max * 100) + " only." };
      }
      var rem = Math.max(0, target - cur);
      return {
        pct: Math.min(100, Math.round((cur / target) * 100)),
        msg: rem > 0 ? "Spend " + moneyVal(rem * 100) + " more to unlock your free gift!" : "",
      };
    }
    if (t === "quantity") {
      var curQ    = cart.items.reduce(function (sum, i) {
        return String(i.variant_id) === fid ? sum : sum + i.quantity;
      }, 0);
      var targetQ = settings.freebieMinQuantity;
      var maxQ    = settings.freebieMaxQuantity;
      if (maxQ && curQ > maxQ) {
        return { pct: 100, msg: "Free gift available for orders up to " + maxQ + " items only." };
      }
      var remQ = Math.max(0, targetQ - curQ);
      return {
        pct: Math.min(100, Math.round((curQ / targetQ) * 100)),
        msg: remQ > 0 ? "Add " + remQ + " more item" + (remQ !== 1 ? "s" : "") + " to unlock your free gift!" : "",
      };
    }
    return null;
  }

  function checkUpsell() {
    if (!cart) return false;
    var t = settings.upsellTriggerType;
    if (t === "cartValue")  return (cart.total_price / 100) >= settings.upsellMinCartValue;
    if (t === "quantity")   return cart.item_count >= settings.upsellMinQuantity;
    if (t === "product") {
      var ids = (settings.upsellTriggerProductIds || []).map(function (p) {
        return extractId(typeof p === "object" ? p.id : p);
      });
      return cart.items.some(function (i) { return ids.indexOf(String(i.product_id)) !== -1; });
    }
    return false;
  }

  /* ===========================================================
     OPEN / CLOSE
  =========================================================== */
  function openCart() {
    if (!initialized) return;
    render();
    isOpen = true;
    /* Re-sync freebie state whenever cart opens */
    syncFreebie();
    var drawer  = id("ec-cart");
    var overlay = id("ec-overlay");
    if (drawer)  drawer.classList.add("ec-cart--open");
    if (overlay) overlay.classList.add("ec-overlay--visible");
    document.body.style.overflow = "hidden";
    var closeBtn = id("ec-close");
    if (closeBtn) setTimeout(function () { closeBtn.focus(); }, 50);
    /* Kick off AI recommendations fetch (async, re-renders footer when ready) */
    fetchAiRecommendations();
  }

  function closeCart() {
    isOpen = false;
    var drawer  = id("ec-cart");
    var overlay = id("ec-overlay");
    if (drawer)  drawer.classList.remove("ec-cart--open");
    if (overlay) overlay.classList.remove("ec-overlay--visible");
    document.body.style.overflow = "";
    if (scarcityTimer) { clearInterval(scarcityTimer); scarcityTimer = null; }
  }

  /* ===========================================================
     EVENT LISTENERS
  =========================================================== */
  function attachGlobalListeners() {
    /* Intercept fetch-based add-to-cart */
    var _origFetch = window.fetch;
    window.fetch = function (input, init) {
      var promise = _origFetch.call(this, input, init);
      if (!ecHandlingAdd && initialized) {
        var url = typeof input === "string" ? input : (input && input.url) ? input.url : "";
        if (url && url.includes("/cart/add")) {
          promise.then(function (res) {
            if (res && res.ok) {
              setTimeout(function () {
                loadCart().then(function (c) { cart = c; render(); openCart(); syncFreebie(); });
              }, 50);
            }
          }).catch(function () {});
        }
      }
      return promise;
    };

    /* Intercept XHR-based add-to-cart */
    var _xhrOpen = XMLHttpRequest.prototype.open;
    var _xhrSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      this._ecUrl = String(url || "");
      return _xhrOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      if (!ecHandlingAdd && initialized && this._ecUrl && this._ecUrl.includes("/cart/add")) {
        var xhr = this;
        xhr.addEventListener("load", function () {
          if (xhr.status >= 200 && xhr.status < 300) {
            setTimeout(function () {
              loadCart().then(function (c) { cart = c; render(); openCart(); syncFreebie(); });
            }, 50);
          }
        }, { once: true });
      }
      return _xhrSend.apply(this, arguments);
    };

    /* Intercept form-based add-to-cart */
    document.addEventListener("submit", function (e) {
      var form = e.target;
      if (!form || form.tagName !== "FORM") return;
      var action = form.getAttribute("action") || "";
      if (!action.includes("/cart/add")) return;

      e.preventDefault();
      e.stopImmediatePropagation();

      var fd  = new FormData(form);
      var vid = fd.get("id");
      var qty = parseInt(fd.get("quantity") || "1", 10);
      if (!vid) { form.submit(); return; }

      setSubmitBtnLoading(form, true);
      cartAdd(vid, qty, {})
        .then(function () { render(); openCart(); syncFreebie(); })
        .catch(function () { form.submit(); })
        .finally(function () { setSubmitBtnLoading(form, false); });
    }, true);

    /* Cart icon / /cart link clicks */
    document.addEventListener("click", function (e) {
      if (e.target.closest("#ec-cart")) return;
      var link = e.target.closest(
        'a[href="/cart"], a[href^="/cart?"], [data-cart-toggle], .cart-link, .header__cart, .cart-icon-bubble'
      );
      if (!link) return;
      e.preventDefault();
      openCart();
    }, false);

    /* Escape key */
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isOpen) closeCart();
    });

    /* Theme cart events */
    document.addEventListener("cart:updated", function () {
      loadCart().then(function (c) { cart = c; if (isOpen) render(); syncFreebie(); });
    });
    document.addEventListener("theme:cart:add", function () {
      loadCart().then(function (c) { cart = c; render(); openCart(); syncFreebie(); });
    });
    document.addEventListener("cart:refresh", function () {
      loadCart().then(function (c) { cart = c; if (isOpen) render(); syncFreebie(); });
    });
  }

  /* ── Drawer click delegation ───────────────────────────── */
  function handleDrawerClick(e) {
    var removeBtn = e.target.closest("[data-action='remove']");
    if (removeBtn) { doCartChange(removeBtn.dataset.key, 0); return; }

    var decBtn = e.target.closest("[data-action='dec']");
    if (decBtn) {
      var q = parseInt(decBtn.dataset.qty, 10);
      if (decBtn.dataset.key && q >= 0) doCartChange(decBtn.dataset.key, q);
      return;
    }

    var incBtn = e.target.closest("[data-action='inc']");
    if (incBtn) {
      var qi = parseInt(incBtn.dataset.qty, 10);
      if (incBtn.dataset.key) doCartChange(incBtn.dataset.key, qi);
      return;
    }

    var upsellBtn = e.target.closest("[data-action='upsell']");
    if (upsellBtn) {
      var vid = upsellBtn.dataset.variant;
      if (!vid) return;
      upsellBtn.disabled    = true;
      upsellBtn.textContent = "✓ Added";
      upsellBtn.classList.add("ec-upsell-card__add--done");
      cartAdd(vid, 1, {})
        .then(function () { render(); syncFreebie(); })
        .catch(function () {
          upsellBtn.disabled = false;
          upsellBtn.textContent = "+ Add";
          upsellBtn.classList.remove("ec-upsell-card__add--done");
        });
      return;
    }

    var discRemoveBtn = e.target.closest("[data-action='discount-remove']");
    if (discRemoveBtn) { clearDiscount(); return; }

  }

  function doCartChange(key, qty) {
    updatingKeys[key] = true;
    renderBody();
    cartChange(key, qty)
      .then(function () {
        delete updatingKeys[key];
        aiSeedProductId = null; /* invalidate AI cache — cart composition changed */
        render();
        syncFreebie();
        fetchAiRecommendations();
      })
      .catch(function () { delete updatingKeys[key]; render(); });
  }

  function setSubmitBtnLoading(form, loading) {
    var btn = form.querySelector('[type="submit"]');
    if (!btn) return;
    if (loading) {
      btn.dataset.ecOrig = btn.textContent;
      btn.textContent    = "Adding…";
      btn.disabled       = true;
    } else {
      btn.textContent = btn.dataset.ecOrig || btn.textContent;
      btn.disabled    = false;
    }
  }

  /* ===========================================================
     HELPERS
  =========================================================== */
  function injectCustomCode() {
    if (settings.customCss) {
      var style = document.createElement("style");
      style.id = "ec-custom-css";
      style.textContent = settings.customCss;
      document.head.appendChild(style);
    }
    if (settings.customJs) {
      try {
        /* Run merchant JS in global scope, isolated from our IIFE */
        // eslint-disable-next-line no-new-func
        (new Function(settings.customJs))();
      } catch (e) {
        console.warn("[EdgeCart] Custom JS error:", e);
      }
    }
  }

  function injectDynamicCSS() {
    var style = document.createElement("style");
    style.id  = "ec-dynamic";
    style.textContent = [
      ":root{",
        "--ec-primary:"       + (settings.primaryColor     || "#000") + ";",
        "--ec-banner-bg:"     + (settings.bannerBgColor    || "#1a1a1a") + ";",
        "--ec-banner-text:"   + (settings.bannerTextColor  || "#fff") + ";",
        "--ec-scarcity-bg:"   + (settings.scarcityBgColor  || "#e53e3e") + ";",
        "--ec-scarcity-text:" + (settings.scarcityTextColor || "#fff") + ";",
      "}",
    ].join("");
    document.head.appendChild(style);
  }

  function syncCartBadges() {
    var count = (cart && cart.item_count) || 0;
    document.querySelectorAll(
      "[data-cart-count], .cart-count, #CartCount, .cart-item-count, .header__cart-bubble, .cart-bubble"
    ).forEach(function (el) {
      el.textContent   = count;
      el.style.display = count > 0 ? "" : "none";
    });
  }

  function checkoutUrl() {
    return discountCode
      ? "/checkout?discount=" + encodeURIComponent(discountCode)
      : "/checkout";
  }

  function money(cents) { return moneyVal(cents); }

  function moneyVal(cents) {
    var currency = (window.Shopify && window.Shopify.currency && window.Shopify.currency.active)
      || (cart && cart.currency)
      || "USD";
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency", currency: currency, minimumFractionDigits: 2,
      }).format(cents / 100);
    } catch (_) {
      return "$" + (cents / 100).toFixed(2);
    }
  }

  function extractId(gid) {
    if (!gid) return "";
    var s = String(gid);
    return s.includes("/") ? s.split("/").pop() : s;
  }

  function esc(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function id(elId) { return document.getElementById(elId); }
  function make(tag, cls) { var el = document.createElement(tag); if (cls) el.className = cls; return el; }
  function on(el, evt, fn) { if (el) el.addEventListener(evt, fn); }

  /* ── SVG icons ─────────────────────────────────────────── */
  function svgClose() {
    return '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M15 5L5 15M5 5l10 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  function svgX() {
    return '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M11 3L3 11M3 3l8 8" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>';
  }
  function svgCart(cls) {
    return '<svg class="' + cls + '" viewBox="0 0 64 64" fill="none" aria-hidden="true"><circle cx="32" cy="32" r="30" stroke="currentColor" stroke-width="2"/><path d="M18 24h28l-3.5 16H21.5L18 24z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M26 24v-4a6 6 0 0112 0v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  }
  function svgRwTag(unlocked) {
    var c = unlocked ? "#fff" : "#9ca3af";
    return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" stroke="' + c + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="7" cy="7" r="1.5" fill="' + c + '"/></svg>';
  }
  function svgRwGift(unlocked) {
    var c = unlocked ? "#fff" : "#9ca3af";
    return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><polyline points="20 12 20 22 4 22 4 12" stroke="' + c + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><rect x="2" y="7" width="20" height="5" stroke="' + c + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="22" x2="12" y2="7" stroke="' + c + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z" stroke="' + c + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" stroke="' + c + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  /* ===========================================================
     START
  =========================================================== */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
