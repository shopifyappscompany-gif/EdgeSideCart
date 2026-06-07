/* ============================================================
   EdgeCart SideCart — Storefront JavaScript
   ============================================================ */
(function () {
  "use strict";

  /* ── Config injected by liquid ─────────────────────────── */
  var PROXY = window.EdgeCartProxy || "/apps/edge-cart";
  var SHOP  = window.EdgeCartShop  || "";

  /* Fire-and-forget analytics event — never blocks the UI */
  function track(event, extra) {
    try {
      var payload = Object.assign({ event: event }, extra || {});
      var url = PROXY + "/api/track" + (SHOP ? "?shop=" + encodeURIComponent(SHOP) : "");
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "same-origin",
        keepalive: true,
      }).catch(function () {});
    } catch (_) {}
  }

  /* ── State ─────────────────────────────────────────────── */
  var settings          = null;
  var cart              = null;
  var discountCode       = "";
  var appliedDiscount    = null;
  var discountLoading    = false;
  var discountError      = "";
  var discountSuccess    = false;
  var discountInputValue = ""; /* preserves typed code while footer re-renders */
  var sfToken = ""; /* Storefront API token for discount validation */
  var sfShop  = ""; /* Shopify permanent domain, e.g. "store.myshopify.com" */
  var waDialCode         = "91"; /* selected country dial code (no +) — India default */
  var waLocalNumber      = "";   /* local part of phone entered by customer */
  var orderNote         = "";
  var aiRecommendations       = [];
  var aiRecommendationsFetching = false;
  var aiSeedProductId         = null; /* cache key — refetch when seed changes */
  var freebieToastTimer = null;
  var isOpen            = false;
  var initialized       = false;
  var updatingKeys      = {};
  var freebieAutoSync      = {};   /* keyed by offer.id */
  var freebieRetryAt       = {};   /* keyed by offer.id */
  var maxExceededNotified  = {};   /* keyed by offer.id — prevents toast spam */
  var tierUnlockedState    = {};   /* keyed by tier.id — fires confetti on unlock transition */
  var ecHandlingAdd        = false;
  var lastNativeAddAt      = 0;     /* timestamp of a theme-fired /cart/add we observed (not ours) */
  var scarcityTimer        = null;
  var inventoryCache       = {};   /* keyed by variant_id — stores inventory_quantity */
  var inventoryFetching    = {};   /* keyed by handle — prevents duplicate in-flight fetches */
  var cartShareToastTimer  = null;
  var orderSummaryOpen     = false;
  var couponsOpen          = false;   /* "View all coupons" panel expanded? */
  var announcementIndex    = 0;
  var announcementTimer    = null;
  var lastBannerText       = null;  /* triggers the slide animation only on text change */
  var collectionCache      = {};    /* collection handle -> array of product id strings (for banner targeting) */

  /* ===========================================================
     BOOT
  =========================================================== */
  function boot() {
    Promise.all([loadSettings(), loadCart()])
      .then(function (results) {
        settings = results[0];
        cart     = results[1];
        sfToken  = (settings && settings.storefrontToken) || "";
        sfShop   = (settings && settings.shop) || SHOP || "";
        if (settings && settings.blockCartPage && window.location.pathname === "/cart") {
          sessionStorage.setItem("ec-reopen-cart", "1");
          var ref = document.referrer;
          var sameOrigin = ref && ref.startsWith(window.location.origin) && ref.indexOf("/cart") === -1;
          window.location.replace(sameOrigin ? ref : "/");
          return;
        }
        if (!settings || !settings.enabled) return;
        injectDynamicCSS();
        injectCustomCode();
        buildDOM();
        replaceThemeCartIcon();
        suppressThemeCart();
        attachGlobalListeners();
        initialized = true;

        /* ── Public API — callable from console, GoKwik, or any 3rd-party script ── */
        window.EdgeCart = {
          open:    function () { loadCart().then(function (c) { cart = c; render(); openCart(); syncFreebie(); }); },
          close:   closeCart,
          toggle:  function () { if (isOpen) closeCart(); else window.EdgeCart.open(); },
          refresh: function () { loadCart().then(function (c) { cart = c; render(); syncFreebie(); }); },
          isOpen:  function () { return isOpen; },
        };

        if (sessionStorage.getItem("ec-reopen-cart")) {
          sessionStorage.removeItem("ec-reopen-cart");
          setTimeout(openCart, 300);
        }
        if (settings.autoDiscountEnabled && settings.autoDiscountCode) {
          applyDiscount(settings.autoDiscountCode);
        }
        syncFreebie();
        trackRecentlyViewed();
        initStickyAtc();
        initProductPage();
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
      return r.json().then(function (addedItem) {
        return loadCart().then(function (c) {
          cart = c;
          document.dispatchEvent(new CustomEvent('cart:updated'));
          return addedItem;
        });
      });
    }).catch(function (err) {
      ecHandlingAdd = false;
      throw err;
    });
  }

  function cartChange(key, quantity, useLineIndex) {
    /* Default: identify the line by its KEY (position-independent, the original
       behavior — safe for automatic flows like freebie/OCU/gift-wrap removal that
       can run against a momentarily stale cart).
       useLineIndex=true: identify by 1-based line number instead. Only the
       user-initiated line-item controls use this, because when a discount code is
       applied Shopify re-keys discounted lines so the stale key no longer matches
       and the change is silently rejected (the "can't remove a discounted product"
       bug). The user path runs on a settled cart, so the index is reliable there. */
    var body = { quantity: quantity };
    var idx = -1;
    if (useLineIndex && cart && cart.items) {
      for (var i = 0; i < cart.items.length; i++) {
        if (cart.items[i].key === key) { idx = i + 1; break; }
      }
    }
    if (idx > 0) body.line = idx; else body.id = key;
    return fetch("/cart/change.js", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      credentials: "same-origin",
      body: JSON.stringify(body),
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

  /* Once a code is applied via /cart/update.js (see applyDiscountSession), the
     AJAX Cart API DOES reflect it: /cart.js populates discount_codes[] with
     applicable:true/false and reduces total_price. We read those authoritative
     values for the in-cart preview, and the code carries into checkout. */
  function gidToId(gid) {
    var m = String(gid || "").match(/(\d+)\s*$/);
    return m ? m[1] : "";
  }
  function lineEligibleForDiscount(line, d) {
    if (!d || d.appliesToAll) return true;
    var pid = String(line.product_id || "");
    var vid = String(line.variant_id || "");
    var i;
    if (d.productIds && d.productIds.length) {
      for (i = 0; i < d.productIds.length; i++) if (gidToId(d.productIds[i]) === pid) return true;
    }
    if (d.variantIds && d.variantIds.length) {
      for (i = 0; i < d.variantIds.length; i++) if (gidToId(d.variantIds[i]) === vid) return true;
    }
    /* Collection-scoped codes: membership can't be resolved on the storefront, so
       we don't size them here — Shopify applies the real amount at checkout. */
    return false;
  }
  /* Savings (cents) attributable to the manually-entered CODE only, read from
     Shopify's own per-line allocations (type "discount_code"). Isolating the code
     from any automatic/script discounts is what stops the order summary from
     double-counting (auto discounts are already inside original−total_price). */
  function lineCodeSavings(line) {
    var allocs = (line && line.line_level_discount_allocations) || [];
    var sum = 0;
    for (var j = 0; j < allocs.length; j++) {
      var da = allocs[j].discount_application || {};
      if ((da.type || "") === "discount_code") sum += allocs[j].amount || 0;
    }
    return sum;
  }
  function codeAllocatedSavings() {
    if (!cart) return 0;
    var items = cart.items || [];
    var sum = 0;
    for (var i = 0; i < items.length; i++) sum += lineCodeSavings(items[i]);
    return sum;
  }
  /* Savings in cents for the applied code discount (the code's own portion). */
  function discountSavings() {
    if (!cart || !appliedDiscount) return 0;
    var coded = codeAllocatedSavings();
    if (coded > 0) return coded;
    if (appliedDiscount.nativeAmount > 0) return appliedDiscount.nativeAmount;
    return 0;
  }
  /* Is a valid code actually usable on THIS cart? Mirrors what native checkout
     would enforce: minimum spend / quantity, and specific-product scope. */
  function discountEligibility(d) {
    var items = cart.items || [];
    var mr = d.minimumRequirement;
    if (mr) {
      if (mr.type === "subtotal") {
        var need = Math.round((mr.subtotal || 0) * 100);
        if (cart.total_price < need) return { ok: false, message: "Add " + money(need - cart.total_price) + " more to use this code" };
      } else if (mr.type === "quantity") {
        if ((cart.item_count || 0) < mr.quantity) return { ok: false, message: "Add " + (mr.quantity - (cart.item_count || 0)) + " more item(s) to use this code" };
      }
    }
    if (!d.appliesToAll && d.type !== "free_shipping" && d.type !== "bxgy" &&
        ((d.productIds && d.productIds.length) || (d.variantIds && d.variantIds.length))) {
      var hasEligible = false;
      for (var i = 0; i < items.length; i++) { if (lineEligibleForDiscount(items[i], d)) { hasEligible = true; break; } }
      if (!hasEligible) return { ok: false, message: "This code doesn't apply to the items in your cart" };
    }
    return { ok: true };
  }

  /* Applies a discount code to the cart via the AJAX Cart API's `discount`
     parameter (Shopify added this to /cart/update.js in 2025). Shopify validates
     the code server-side exactly like native checkout — expiry, eligibility,
     minimum-spend/quantity, Buy X Get Y — and carries it into checkout. After
     this resolves, /cart.js reflects discount_codes[].applicable and reduces
     total_price, so the in-cart preview and validation are authoritative.
     Pass "" to remove all codes from the cart. */
  function applyDiscountSession(code) {
    return fetch("/cart/update.js", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      credentials: "same-origin",
      body: JSON.stringify({ discount: code }),
    }).then(function (r) { return r.json(); }).catch(function () { return null; });
  }

  /* Apply a discount code.
     Step 1 — hit /discount/CODE so Shopify sets its session cookie (same as visiting
               the link in an email; works even for invalid codes — Shopify just ignores them).
     Step 2 — reload /cart.js; Shopify now populates discount_codes[] with applicable:true
               for every valid code, and reduces total_price accordingly.
     Step 3 — read discount_codes[] to confirm validity; use original_total_price - total_price
               as the authoritative saving. Zero server calls to our backend. */
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
      /* Apply the code to the cart; /cart/update.js returns the updated cart so
         we use it directly (no extra /cart.js round-trip = faster apply). */
      var updated = await applyDiscountSession(upperCode);
      cart = (updated && updated.items) ? updated : await loadCart();

      /* Shopify sets applicable:true only for codes that are genuinely valid */
      var appliedInCart = (cart.discount_codes || []).some(function (dc) {
        return (dc.code || "").toUpperCase() === upperCode && dc.applicable;
      });

      if (!appliedInCart) {
        discountCode    = "";
        appliedDiscount = null;
        discountError   = "Invalid discount code or not applicable to your cart.";
        discountLoading = false;
        if (isOpen) renderFooter();
        return;
      }

      /* The code's own saving comes from its per-line allocations (excludes any
         automatic discounts), so previews never double-count. */
      var cartDiscount = codeAllocatedSavings();

      discountCode       = upperCode;
      appliedDiscount    = {
        valid: true,
        type: cartDiscount > 0 ? "fixed_amount" : "checkout-only",
        nativeAmount: cartDiscount,
        appliesToAll: true,
        productIds: [],
        variantIds: [],
        minimumRequirement: null,
        code: upperCode,
      };
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

  /* Remove the applied discount code from UI, state, AND the cart session.
     Posting discount:"" to /cart/update.js clears all codes server-side, so the
     code won't carry into checkout and total_price returns to full price.
     To avoid the 1–2s lag while Shopify responds, we optimistically restore the
     totals in-memory and re-render immediately, then reconcile with the real
     cart that /cart/update.js returns. */
  async function clearDiscount() {
    var removed = codeAllocatedSavings(); /* code's current saving, before removal */
    discountCode       = "";
    appliedDiscount    = null;
    discountError      = "";
    discountSuccess    = false;
    discountInputValue = "";

    /* Optimistic restore: add the code's saving back and strip its allocations so
       the total, per-line badges and order summary all update instantly. */
    if (cart && removed > 0) {
      cart.total_price    = (cart.total_price || 0) + removed;
      cart.total_discount = Math.max(0, (cart.total_discount || 0) - removed);
      (cart.items || []).forEach(function (it) {
        it.line_level_discount_allocations = ((it.line_level_discount_allocations) || []).filter(function (a) {
          return ((a.discount_application || {}).type || "") !== "discount_code";
        });
      });
    }
    if (isOpen) render();

    try {
      /* /cart/update.js returns the authoritative cart — use it directly. */
      var updated = await applyDiscountSession("");
      cart = (updated && updated.items) ? updated : await loadCart();
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
        '<div class="ec-header">',
          '<h2 class="ec-header__title" id="ec-header-title"></h2>',
          '<button class="ec-header__close" id="ec-close" aria-label="Close cart">',
            svgClose(),
          '</button>',
        '</div>',
        '<div class="ec-banner" id="ec-banner"></div>',
        '<div class="ec-scarcity" id="ec-scarcity" style="display:none"></div>',
        '<div class="ec-rewards" id="ec-rewards" style="display:none"></div>',
        '<div class="ec-scroll-area" id="ec-scroll-area">',
          '<div class="ec-body" id="ec-body"></div>',
          '<div class="ec-footer" id="ec-footer"></div>',
        '</div>',
        '<div class="ec-checkout-bar" id="ec-checkout-bar"></div>',
      '</div>',
    ].join("");

    document.body.appendChild(overlay);
    document.body.appendChild(drawer);

    /* Add-to-cart toast (outside the drawer so it's visible when cart is closed) */
    var atcToastEl = make("div", "ec-atc-toast");
    atcToastEl.id = "ec-atc-toast";
    document.body.appendChild(atcToastEl);

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
    syncMaxExceeded();
  }

  /* Conditional banners: an announcement can target the cart. Defaults to "always"
     so existing banners keep showing. cartValue/quantity/product are resolved from
     the live cart; collection isn't (cart.js has no collection data) so it shows. */
  function announcementMatches(ann) {
    var ct = ann.conditionType || "always";
    if (ct === "always") return true;
    if (!cart) return false;
    if (ct === "cartValue") return (cart.total_price / 100) >= (parseFloat(ann.minCartValue) || 0);
    if (ct === "quantity")  return (cart.item_count || 0) >= (parseInt(ann.minQuantity, 10) || 0);
    if (ct === "product") {
      var ids = (ann.productIds || []).map(function (p) { return String(typeof p === "object" ? extractId(p.id) : p); });
      if (!ids.length) return true;
      return (cart.items || []).some(function (i) { return ids.indexOf(String(i.product_id)) !== -1; });
    }
    if (ct === "collection") {
      var handles = (ann.collectionIds || []).map(function (c) { return typeof c === "object" ? c.handle : c; }).filter(Boolean);
      if (!handles.length) return true;
      var cartPids = (cart.items || []).map(function (i) { return String(i.product_id); });
      return handles.some(function (h) {
        var pids = collectionCache[h];
        return pids && pids.some(function (pid) { return cartPids.indexOf(pid) !== -1; });
      });
    }
    return true;
  }

  /* Collection membership isn't in /cart.js, so for collection-targeted banners we
     fetch each collection's product ids once (storefront products.json) and cache
     them, then re-render the banner when ready. */
  function prefetchAnnouncementCollections() {
    if (!settings || !settings.announcementsEnabled) return;
    var handles = {};
    (settings.announcements || []).forEach(function (a) {
      if (a.conditionType === "collection") {
        (a.collectionIds || []).forEach(function (c) {
          var h = typeof c === "object" ? c.handle : c;
          if (h && !(h in collectionCache)) handles[h] = true;
        });
      }
    });
    Object.keys(handles).forEach(function (h) {
      collectionCache[h] = null; /* mark loading */
      fetch("/collections/" + encodeURIComponent(h) + "/products.json?limit=250", { credentials: "same-origin" })
        .then(function (r) { return r.ok ? r.json() : { products: [] }; })
        .then(function (d) {
          collectionCache[h] = (d.products || []).map(function (p) { return String(p.id); });
          renderBanner();
        })
        .catch(function () { collectionCache[h] = []; });
    });
  }
  function activeAnnouncements() {
    return (settings.announcements || []).filter(function (a) {
      return a.enabled !== false && a.text && announcementMatches(a);
    });
  }

  /* Sets banner text/colors; slides the new message in only when the text actually
     changes (so rotation animates, but ordinary re-renders don't flicker). */
  function setBannerContent(el, text, bg, color) {
    el.textContent      = text;
    el.style.display    = "";
    el.style.background = bg;
    el.style.color      = color;
    if (text !== lastBannerText) {
      el.style.animation = "none";
      void el.offsetWidth; /* force reflow so the animation restarts */
      el.style.animation = "ec-banner-slide 0.45s var(--ec-ease)";
      lastBannerText = text;
    }
  }

  function renderBanner() {
    var el = id("ec-banner");
    if (!el || !settings) return;

    if (settings.announcementsEnabled) {
      var msgs = activeAnnouncements();
      if (msgs.length > 0) {
        var msg = msgs[announcementIndex % msgs.length];
        setBannerContent(el, msg.text, msg.bgColor || "#1a1a1a", msg.textColor || "#fff");
        return;
      }
    }

    if (settings.bannerEnabled && settings.bannerText) {
      setBannerContent(el, settings.bannerText, settings.bannerBgColor || "#1a1a1a", settings.bannerTextColor || "#fff");
    } else {
      el.style.display = "none";
    }
  }

  function startAnnouncementTimer() {
    stopAnnouncementTimer();
    if (!settings || !settings.announcementsEnabled) return;
    /* Rotate even if only some banners currently match — the matching set is
       recomputed each tick so it adapts as the cart changes. */
    if ((settings.announcements || []).filter(function (a) { return a.enabled !== false && a.text; }).length <= 1) return;
    var interval = Math.max(1, settings.announcementInterval || 4) * 1000;
    announcementTimer = setInterval(function () {
      announcementIndex = announcementIndex + 1;
      renderBanner();
    }, interval);
  }

  function stopAnnouncementTimer() {
    if (announcementTimer) { clearInterval(announcementTimer); announcementTimer = null; }
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

    /* Highest tier already reached — so we can name the reward the customer has earned. */
    var unlockedTier = null;
    for (var u = tiers.length - 1; u >= 0; u--) {
      if (currentVal >= tiers[u].threshold) { unlockedTier = tiers[u]; break; }
    }
    var unlockedName = unlockedTier ? (unlockedTier.unlockedLabel || unlockedTier.label || "your reward") : "";

    var msg;
    if (!nextTier) {
      /* Everything unlocked — name the top reward they've earned */
      msg = unlockedName ? "🎉 You've unlocked " + unlockedName + "!" : "🎉 All rewards unlocked!";
    } else {
      var rem    = nextTier.threshold - currentVal;
      var remFmt = useQty
        ? Math.ceil(rem) + " item" + (Math.ceil(rem) !== 1 ? "s" : "")
        : money(Math.max(0, rem) * 100);
      var rewardName = nextTier.unlockedLabel || nextTier.label || "next reward";
      msg = unlockedTier
        ? "🎉 " + unlockedName + " unlocked! Add " + remFmt + " more for " + rewardName
        : "Add More Worth " + remFmt + " for " + rewardName;
    }

    var fillPct = maxVal > 0 ? Math.min(100, Math.round((currentVal / maxVal) * 100)) : 100;

    var nodesHTML = tiers.map(function (tier) {
      var unlocked  = currentVal >= tier.threshold;
      var pct       = maxVal > 0 ? Math.round((tier.threshold / maxVal) * 100) : 100;
      var threshFmt = useQty
        ? tier.threshold + (tier.threshold === 1 ? " item" : " items")
        : money(tier.threshold * 100);
      var isGift    = /free|gift|product/i.test(tier.unlockedLabel || tier.label || "");

      /* Fire confetti + 5-second toast when a tier transitions locked → unlocked */
      var wasUnlocked = tierUnlockedState[tier.id];
      if (unlocked && !wasUnlocked) {
        if (tier.confettiEnabled !== false) launchConfetti();
        showToast(tier.unlockedLabel || "🎉 Reward unlocked!", 5000, false);
      }
      tierUnlockedState[tier.id] = unlocked;

      var lbl = tier.unlockedLabel || tier.label || threshFmt;
      return [
        '<div class="ec-rw__node' + (unlocked ? ' ec-rw__node--done' : '') + '" style="left:' + pct + '%">',
          '<span class="ec-rw__price">' + esc(threshFmt) + '</span>',
          '<div class="ec-rw__dot">' + (isGift ? svgRwGift(unlocked) : svgRwTag(unlocked)) + '</div>',
          '<span class="ec-rw__lbl">' + esc(lbl) + '</span>',
        '</div>',
      ].join("");
    }).join("");

    var clampedPct = Math.min(100, Math.max(0, fillPct));
    var fillStyle = 'display:block;height:100%;width:' + clampedPct + '%;background:linear-gradient(90deg,#f472b6 0%,#dc2626 100%);border-radius:4px;';

    el.innerHTML = [
      '<div class="ec-rw__inner">',
        '<p class="ec-rw__msg">' + esc(msg) + '</p>',
        '<div class="ec-rw__stage">',
          '<div class="ec-rw__bar">',
            '<div style="' + fillStyle + '"></div>',
          '</div>',
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
      var rvHtml = "";
      if (settings.recentlyViewedEnabled) {
        rvHtml = buildRecentlyViewedHTML();
      }
      if (rvHtml) {
        body.innerHTML = rvHtml;
      } else {
        body.innerHTML = [
          '<div class="ec-empty">',
            svgCart("ec-empty__icon"),
            '<p class="ec-empty__text">Your cart is empty</p>',
            '<p class="ec-empty__sub">Add items to get started</p>',
            '<button class="ec-empty__btn" id="ec-keep-shopping">Continue Shopping</button>',
          '</div>',
        ].join("");
      }
      on(id("ec-keep-shopping"), "click", closeCart);
      return;
    }

    var ocuBodyHtml = "";
    if (settings.ocuEnabled && settings.ocuProductVariantId) {
      var ocuBodyNumId = String(settings.ocuProductVariantId).replace(/[^0-9]/g, "");
      var ocuBodyInCart = cart.items.some(function (i) { return String(i.variant_id) === ocuBodyNumId; });
      var hideWhenInCart = settings.ocuHideWhenInCart !== false;
      if (!(hideWhenInCart && ocuBodyInCart)) {
        ocuBodyHtml = buildOcuHTML(ocuBodyInCart);
      }
    }

    var giftWrapBodyHtml = "";
    if (settings.giftWrapEnabled && settings.giftWrapProductVariantId) {
      var gwNumId = String(settings.giftWrapProductVariantId).replace(/[^0-9]/g, "");
      var gwInCart = cart.items.some(function (i) { return String(i.variant_id) === gwNumId; });
      var gwHide = settings.giftWrapHideWhenInCart !== false;
      if (!(gwHide && gwInCart)) {
        giftWrapBodyHtml = buildGiftWrapHTML(gwInCart);
      }
    }

    var freeShipHtml = settings.freeShippingBarEnabled ? buildFreeShippingBarHTML() : "";
    var freebieTopHtml = settings.freebieShowAtTop ? buildFreebieHTML() : "";

    body.innerHTML = freebieTopHtml + freeShipHtml + '<div class="ec-items" id="ec-items">' + cart.items.map(renderItem).join("") + '</div>' + ocuBodyHtml + giftWrapBodyHtml;

    /* Bind OCU checkbox */
    var ocuBodyCheck = id("ec-ocu-check");
    if (ocuBodyCheck && settings.ocuEnabled && settings.ocuProductVariantId) {
      var ocuBodyId = String(settings.ocuProductVariantId).replace(/[^0-9]/g, "");
      on(ocuBodyCheck, "change", function () {
        if (ocuBodyCheck.checked) {
          ocuBodyCheck.disabled = true;
          cartAdd(ocuBodyId, 1, {}).catch(function () { ocuBodyCheck.checked = false; }).finally(function () { ocuBodyCheck.disabled = false; });
        } else {
          var ocuBodyItem = cart.items.find(function (i) { return String(i.variant_id) === ocuBodyId; });
          if (ocuBodyItem) {
            ocuBodyCheck.disabled = true;
            cartChange(ocuBodyItem.key, 0).catch(function () { ocuBodyCheck.checked = true; }).finally(function () { ocuBodyCheck.disabled = false; });
          }
        }
      });
    }

    /* Bind Gift Wrap checkbox */
    var gwCheck = id("ec-gw-check");
    if (gwCheck && settings.giftWrapEnabled && settings.giftWrapProductVariantId) {
      var gwId = String(settings.giftWrapProductVariantId).replace(/[^0-9]/g, "");
      on(gwCheck, "change", function () {
        if (gwCheck.checked) {
          gwCheck.disabled = true;
          cartAdd(gwId, 1, { _edge_cart_gift_wrap: "true" }).catch(function () { gwCheck.checked = false; }).finally(function () { gwCheck.disabled = false; });
        } else {
          var gwItem = cart.items.find(function (i) { return String(i.variant_id) === gwId; });
          if (gwItem) {
            gwCheck.disabled = true;
            cartChange(gwItem.key, 0).catch(function () { gwCheck.checked = true; }).finally(function () { gwCheck.disabled = false; });
          }
        }
      });
    }

    /* Qty manual input */
    qsa(".ec-qty__input", body).forEach(function(inp) {
      on(inp, "change", function() {
        var newQty = parseInt(inp.value, 10);
        if (isNaN(newQty) || newQty < 1) { inp.value = inp.dataset.prevVal || 1; return; }
        inp.dataset.prevVal = newQty;
        doCartChange(inp.dataset.key, newQty);
      });
      on(inp, "focus", function() { inp.dataset.prevVal = inp.value; });
      on(inp, "keydown", function(e) {
        if (e.key === "Enter") { inp.blur(); }
      });
    });

    /* Fetch inventory for stock scarcity (async) */
    if (settings.stockScarcityEnabled) fetchInventoryForItems();
  }

  function getFreebieOffer(item) {
    if (!settings) return null;
    var offers = settings.freebieOffers || [];
    for (var i = 0; i < offers.length; i++) {
      var offer = offers[i];
      if (!offer.productVariantId) continue;
      var numId = extractId(offer.productVariantId);
      if (String(item.variant_id) === numId ||
          (item.properties && item.properties._edge_cart_freebie === "true")) {
        return offer;
      }
    }
    return null;
  }

  function isFreebieItem(item) {
    return !!getFreebieOffer(item);
  }

  function renderItem(item) {
    var freebieOffer = getFreebieOffer(item);
    var freebie = !!freebieOffer;
    var img = (item.featured_image && item.featured_image.url)
      ? item.featured_image.url
      : (item.image || (freebie ? (freebieOffer.productImageUrl || "") : ""));
    var hasDisc = item.line_price < item.original_line_price;
    var lineSave = freebie ? 0 : lineCodeSavings(item); /* code discount on THIS line */
    var isUpd   = updatingKeys[item.key];
    var isFreebieLoading = freebie && freebieOffer && freebieAutoSync[freebieOffer.id];
    var showVar = settings.showVariantTitle !== false;

    var qtyOrSpinner = isUpd
      ? '<div class="ec-qty ec-qty--spin"><div class="ec-spin-circle"></div></div>'
      : [
          '<div class="ec-qty">',
            '<button class="ec-qty__btn" data-action="' + (item.quantity <= 1 ? "remove" : "dec") + '" data-key="' + esc(item.key) + '" data-qty="' + (item.quantity - 1) + '" aria-label="' + (item.quantity <= 1 ? "Remove" : "Decrease") + '">−</button>',
            '<input class="ec-qty__val ec-qty__input" type="number" min="1" value="' + item.quantity + '" data-key="' + esc(item.key) + '" aria-label="Quantity">',
            '<button class="ec-qty__btn" data-action="inc" data-key="' + esc(item.key) + '" data-qty="' + (item.quantity + 1) + '" aria-label="Increase">+</button>',
          '</div>',
        ].join("");

    var scarcityBadge = "";
    if (settings.stockScarcityEnabled && !freebie) {
      var invQty = inventoryCache[item.variant_id];
      var threshold = settings.stockScarcityThreshold || 5;
      if (invQty !== undefined && invQty !== null && invQty <= threshold && invQty > 0) {
        var scarcityTxt = (settings.stockScarcityText || "Only {{count}} left!").replace("{{count}}", String(invQty));
        scarcityBadge = '<span class="ec-item__scarcity">' + esc(scarcityTxt) + '</span>';
      }
    }

    return [
      '<div class="ec-item' + (isFreebieLoading ? " ec-item--syncing" : "") + (freebie ? " ec-item--freebie" : "") + (isUpd ? " ec-item--updating" : "") + '" data-key="' + esc(item.key) + '">',
        '<div class="ec-item__img">',
          img
            ? '<img src="' + esc(img) + '" alt="' + esc(item.product_title) + '" loading="lazy">'
            : '<div class="ec-item__img-placeholder"></div>',
        '</div>',
        '<div class="ec-item__body">',
          '<div class="ec-item__top">',
            '<div class="ec-item__info">',
              settings.clickableLineItems !== false
                ? '<a class="ec-item__title ec-item__title--link" href="' + esc(item.url || ("/products/" + (item.handle || ""))) + '">' + esc(item.product_title) + '</a>'
                : '<p class="ec-item__title">' + esc(item.product_title) + '</p>',
              showVar && item.variant_title && item.variant_title !== "Default Title"
                ? '<p class="ec-item__variant">' + esc(item.variant_title) + '</p>'
                : "",
              scarcityBadge,
            '</div>',
            freebie
              ? (isFreebieLoading
                  ? '<div class="ec-spin-circle ec-spin-circle--sm"></div>'
                  : '<span class="ec-item__free-badge">FREE</span>')
              : '<button class="ec-item__remove" data-action="remove" data-key="' + esc(item.key) + '" aria-label="Remove">' + svgTrash() + '</button>',
          '</div>',
          '<div class="ec-item__bottom">',
            freebie
              ? '<span class="ec-item__gift-label">🎁 Free Gift</span>'
              : qtyOrSpinner,
            '<div class="ec-item__price">',
              freebie
                ? '<span class="ec-item__line ec-item__line--free">FREE</span>'
                : [
                  hasDisc ? '<span class="ec-item__orig">' + money(item.original_line_price) + '</span>' : "",
                  '<span class="ec-item__line' + (hasDisc ? " ec-item__line--sale" : "") + '">' + money(item.line_price) + '</span>',
                ].join(""),
            '</div>',
          '</div>',
          lineSave > 0
            ? '<div class="ec-item__disc"><span class="ec-item__disc-tag">🏷 ' + esc(discountCode || "Discount") + '</span><span class="ec-item__disc-amt">−' + money(lineSave) + '</span></div>'
            : "",
        '</div>',
      '</div>',
    ].join("");
  }

  /* Active, valid merchant-configured coupons (skips blanks/disabled). */
  function enabledCoupons() {
    return ((settings && settings.configuredDiscounts) || []).filter(function (c) {
      return c && c.enabled !== false && (c.code || "").trim();
    });
  }

  /* Merchant-configured description for a code (from the View All Offers list),
     shown in the order summary so the customer sees what the discount is. */
  function couponDescription(code) {
    if (!code) return "";
    var list = (settings && settings.configuredDiscounts) || [];
    for (var i = 0; i < list.length; i++) {
      if ((list[i].code || "").toUpperCase() === String(code).toUpperCase()) return list[i].description || "";
    }
    return "";
  }

  /* "View all coupons" trigger + expandable list of coupon cards (screenshot UI).
     Codes come from app settings; tapping Apply runs the same validated flow as
     the discount field, so eligibility is enforced by Shopify. */
  function buildCouponsHTML() {
    if (!settings.offersEnabled) return "";
    var list = enabledCoupons();
    if (!list.length) return "";

    var cards = list.map(function (c) {
      var code = (c.code || "").toUpperCase();
      var isActive = !!discountCode && code === discountCode;
      return [
        '<div class="ec-coupon' + (isActive ? ' ec-coupon--active' : '') + '">',
          '<div class="ec-coupon__info">',
            '<span class="ec-coupon__code">🏷 ' + esc(code) + '</span>',
            c.description ? '<span class="ec-coupon__desc">' + esc(c.description) + '</span>' : '',
          '</div>',
          isActive
            ? '<span class="ec-coupon__applied">✓ Applied</span>'
            : '<button class="ec-coupon__apply" data-action="apply-coupon" data-code="' + esc(code) + '">Apply</button>',
        '</div>',
      ].join("");
    }).join("");

    return [
      '<button class="ec-coupons__trigger" data-action="toggle-coupons" aria-expanded="' + (couponsOpen ? "true" : "false") + '">',
        '<span class="ec-coupons__trigger-label">🎟 View All Offers</span>',
        '<span class="ec-coupons__trigger-side">',
          '<span class="ec-coupons__count">' + list.length + '</span>',
          '<svg class="ec-coupons__chevron" width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        '</span>',
      '</button>',
      '<div class="ec-coupons' + (couponsOpen ? ' ec-coupons--open' : '') + '">',
        '<div class="ec-coupons__list">', cards, '</div>',
      '</div>',
    ].join("");
  }

  function renderFooter() {
    var footer = id("ec-footer");
    var checkoutBar = id("ec-checkout-bar");
    if (!footer || !cart || cart.item_count === 0) {
      if (footer) footer.innerHTML = "";
      if (checkoutBar) checkoutBar.innerHTML = "";
      return;
    }

    /* Use Shopify's own numbers from /cart.js — nothing is calculated here.
       total_price is post-discount (all discounts, incl. our code); original is pre. */
    var savings    = discountSavings();           /* code portion, for the field label */
    var finalTotal = cart.total_price;            /* Shopify's authoritative payable */
    var html = "";

    /* Freebie — skip when shown at top of body */
    if (!settings.freebieShowAtTop) html += buildFreebieHTML();

    /* Volume discounts */
    if (settings.volumeDiscountEnabled) html += buildVolumeDiscountHTML();

    /* Static upsell */
    if (settings.upsellEnabled) html += buildUpsellHTML();

    /* AI upsell (Shopify Recommendations API) */
    if (settings.aiUpsellEnabled) html += buildAiUpsellHTML();

    /* Discount field — shown only when merchant enables it in app settings */
    if (settings.discountEnabled) {
      var isApplied = !!(appliedDiscount && discountCode);
      if (isApplied) {
        var labelText = savings > 0
          ? "You save " + money(savings) + "!"
          : appliedDiscount.type === "free_shipping" ? "Free shipping applied!"
          : appliedDiscount.type === "bxgy" ? "Buy X Get Y applied!"
          : "Discount applied at checkout";
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
            '<div class="ec-discount__wrap">',
              '<input class="ec-discount__input" id="ec-disc-input" type="text" ',
                'placeholder="Enter coupon code" ',
                'value="' + esc(discountInputValue) + '" ',
                'autocomplete="off" spellcheck="false" ',
                'aria-label="Coupon code"' + (discountLoading ? ' disabled' : '') + '>',
              '<button class="ec-discount__apply" id="ec-disc-apply"' + (discountLoading || !discountInputValue.trim() ? ' disabled' : '') + '>',
                discountLoading ? 'Applying…' : 'Apply',
              '</button>',
            '</div>',
            discountLoading
              ? '<p class="ec-discount__msg" aria-live="polite">Applying discount…</p>'
              : discountError
                ? '<p class="ec-discount__error" role="alert" aria-live="assertive">✗ ' + esc(discountError) + '</p>'
                : '',
          '</div>',
        ].join("");
      }

      /* "View all coupons" — merchant-configured code list (screenshot UI) */
      html += buildCouponsHTML();
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

    /* Cart share link */
    if (settings.cartShareEnabled) html += buildCartShareHTML();

    footer.innerHTML = html;

    /* Refresh upsell prices + availability from live Shopify product data */
    if (settings.upsellEnabled) refreshUpsellLiveData();

    /* Checkout bar — rendered outside the scroll area so it never shifts on open */
    if (checkoutBar) {
      var checkoutHtml = "";
      if (settings.deliveryEstimatorEnabled) checkoutHtml += buildDeliveryEstimatorHTML();

      /* Order Summary — placed directly above the checkout button */
      if (settings.orderSummaryEnabled !== false) {
        /* /cart.js total_price already reflects EVERYTHING (automatic + our code).
           Split the total discount into the code's portion vs. automatic so each
           shows on its own line and the "Total savings" never double-counts. */
        var codeDisc2   = codeAllocatedSavings();
        var totalSaved2 = Math.max(0, cart.original_total_price - cart.total_price);
        var autoDisc2   = Math.max(0, totalSaved2 - codeDisc2);
        var subtotal2   = cart.original_total_price - autoDisc2; /* after auto, before code */
        var savingsPct2 = cart.original_total_price > 0
          ? Math.round((totalSaved2 / cart.original_total_price) * 100) : 0;

        var detailRows2 = [
          autoDisc2 > 0 ? [
            '<div class="ec-os__row"><span class="ec-os__row-label">MRP total</span><span class="ec-os__row-price">' + money(cart.original_total_price) + '</span></div>',
            '<div class="ec-os__row"><span class="ec-os__row-label">Discount on MRP</span><span class="ec-os__row-green">−' + money(autoDisc2) + '</span></div>',
            '<div class="ec-os__row"><span class="ec-os__row-label">Cart Subtotal</span><span class="ec-os__row-price">' + money(subtotal2) + '</span></div>',
          ].join("") : '<div class="ec-os__row"><span class="ec-os__row-label">Subtotal</span><span class="ec-os__row-price">' + money(subtotal2) + '</span></div>',
          codeDisc2 > 0 ? '<div class="ec-os__row"><span class="ec-os__row-label">Discount' + (discountCode ? ' (' + esc(discountCode) + ')' : '') + (couponDescription(discountCode) ? '<span class="ec-os__row-sublabel">' + esc(couponDescription(discountCode)) + '</span>' : '') + '</span><span class="ec-os__row-green">−' + money(codeDisc2) + '</span></div>' : "",
          '<div class="ec-os__row"><span class="ec-os__row-label">Shipping</span><span class="ec-os__row-free">FREE</span></div>',
          totalSaved2 > 0 ? '<div class="ec-os__row ec-os__row--savings"><span class="ec-os__row-label">Total savings</span><span class="ec-os__row-green ec-os__row-green--bold">' + money(totalSaved2) + '</span></div>' : "",
          '<div class="ec-os__divider"></div>',
          '<div class="ec-os__row ec-os__row--total"><span class="ec-os__row-total-label">Estimated Total</span><span class="ec-os__row-total-price">' + money(finalTotal) + '</span></div>',
        ].join("");

        checkoutHtml += [
          '<div class="ec-os" id="ec-os">',
            totalSaved2 > 0 ? '<div class="ec-os__saved-bar">🎉 ' + money(totalSaved2) + ' Saved so far!</div>' : "",
            '<button class="ec-os__toggle" id="ec-os-toggle" type="button" aria-expanded="' + (orderSummaryOpen ? "true" : "false") + '">',
              '<div class="ec-os__toggle-left">',
                '<svg class="ec-os__chevron" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
                '<span class="ec-os__toggle-label">Estimated Total</span>',
              '</div>',
              '<div class="ec-os__toggle-right">',
                totalSaved2 > 0 ? '<span class="ec-os__orig-price">' + money(cart.original_total_price) + '</span>' : "",
                '<span class="ec-os__total-price">' + money(finalTotal) + '</span>',
                savingsPct2 > 0 ? '<span class="ec-os__pct-badge">(' + savingsPct2 + '% OFF)</span>' : "",
              '</div>',
            '</button>',
            '<div class="ec-os__panel' + (orderSummaryOpen ? " ec-os__panel--open" : "") + '" id="ec-os-panel">',
              '<div class="ec-os__panel-inner">',
                '<div class="ec-os__panel-header">',
                  '<span class="ec-os__panel-title">Order Summary</span>',
                  totalSaved2 > 0 ? '<span class="ec-os__panel-saved">' + money(totalSaved2) + ' saved so far</span>' : "",
                '</div>',
                detailRows2,
              '</div>',
            '</div>',
          '</div>',
        ].join("");
      }

      checkoutHtml += '<button class="ec-checkout-btn" id="ec-checkout">Checkout · ' + money(finalTotal) + '</button>';
      if (settings.cartRecoveryEnabled) checkoutHtml += buildCartRecoveryHTML();
      if (settings.expressCheckoutEnabled) checkoutHtml += buildExpressCheckoutHTML();
      if (settings.trustBadgesEnabled) checkoutHtml += buildTrustBadgesHTML();
      checkoutBar.innerHTML = checkoutHtml;
    }

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

    /* Bind order summary toggle */
    var osToggle = id("ec-os-toggle");
    var osPanel  = id("ec-os-panel");
    if (osToggle && osPanel) {
      on(osToggle, "click", function () {
        orderSummaryOpen = !orderSummaryOpen;
        osToggle.setAttribute("aria-expanded", orderSummaryOpen ? "true" : "false");
        osPanel.classList.toggle("ec-os__panel--open", orderSummaryOpen);
        osToggle.classList.toggle("ec-os__toggle--open", orderSummaryOpen);
      });
    }

    /* Bind checkout */
    var checkoutBtn = id("ec-checkout");
    if (checkoutBtn) on(checkoutBtn, "click", handleCheckout);

    /* Bind WhatsApp cart recovery — country code select + local number input */
    var waCcSelect   = id("ec-wa-cc");
    var waNumInput   = id("ec-wa-num");
    var waSendBtn    = id("ec-wa-send");
    if (waCcSelect && waNumInput && waSendBtn) {
      on(waCcSelect, "change", function () {
        waDialCode = waCcSelect.value;
      });
      on(waNumInput, "input", function () {
        waLocalNumber = waNumInput.value;
        var digits = waLocalNumber.replace(/[^0-9]/g, "");
        waSendBtn.disabled = digits.length < 6;
      });
      on(waSendBtn, "click", function () {
        var digits = waLocalNumber.replace(/[^0-9]/g, "");
        if (digits.length < 6) return;
        var fullNumber = waDialCode + digits;
        var msg = waSendBtn.getAttribute("data-msg") || "";
        window.open("https://wa.me/" + fullNumber + "?text=" + encodeURIComponent(msg), "_blank", "noopener");
      });
    }

    /* Bind cart share */
    var shareBtn = id("ec-cart-share-btn");
    if (shareBtn) {
      on(shareBtn, "click", function () {
        var permalink = "https://" + window.location.hostname + "/cart/" +
          cart.items.map(function (i) { return i.variant_id + ":" + i.quantity; }).join(",");
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(permalink).then(function () {
            shareBtn.textContent = "Link copied!";
            if (cartShareToastTimer) clearTimeout(cartShareToastTimer);
            cartShareToastTimer = setTimeout(function () {
              shareBtn.textContent = "🔗 " + esc(settings.cartShareText || "Share your cart");
            }, 2500);
          }).catch(function () {
            shareBtn.textContent = "Copy failed";
          });
        } else {
          var ta = document.createElement("textarea");
          ta.value = permalink;
          ta.style.cssText = "position:fixed;top:-9999px";
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand("copy"); shareBtn.textContent = "Link copied!"; } catch (_) {}
          document.body.removeChild(ta);
          if (cartShareToastTimer) clearTimeout(cartShareToastTimer);
          cartShareToastTimer = setTimeout(function () {
            shareBtn.textContent = "🔗 " + esc(settings.cartShareText || "Share your cart");
          }, 2500);
        }
      });
    }
  }

  function handleCheckout() {
    var btn = id("ec-checkout");
    if (btn) { btn.disabled = true; btn.textContent = "Loading…"; }
    track("checkout", { revenue: cart ? cart.total_price : 0 });
    function go() { window.location.href = checkoutUrl(); }
    if (settings.orderNotesEnabled && orderNote.trim()) {
      cartUpdateNote(orderNote.trim()).then(go).catch(go);
    } else {
      go();
    }
  }

  /* ── Freebie toast popup ───────────────────────────────── */
  function showToast(text, duration, withConfetti) {
    var toast = id("ec-freebie-toast");
    if (!toast) return;
    toast.textContent = text || "";
    toast.classList.add("ec-freebie-toast--visible");
    if (freebieToastTimer) clearTimeout(freebieToastTimer);
    freebieToastTimer = setTimeout(function () {
      toast.classList.remove("ec-freebie-toast--visible");
      freebieToastTimer = null;
    }, duration || 3500);
    if (withConfetti) launchConfetti();
  }

  function showFreebieToast(offer) {
    showToast(
      (offer && offer.title) || "🎁 Free gift added to your cart!",
      3500,
      offer ? offer.confettiEnabled !== false : settings.freebieConfettiEnabled !== false
    );
  }

  /* ── Add-to-cart toast ─────────────────────────────────── */
  var atcToastTimer = null;
  function showAddToCartToast(item) {
    var el = id("ec-atc-toast");
    if (!el) return;
    var img = (item && (item.featured_image && item.featured_image.url || item.image)) || "";
    var title = (item && item.product_title) || "Item";
    el.innerHTML = [
      img ? '<img class="ec-atc-toast__img" src="' + esc(img) + '" alt="">' : '<div class="ec-atc-toast__img-placeholder"></div>',
      '<div class="ec-atc-toast__body">',
        '<span class="ec-atc-toast__check">✓</span>',
        '<div>',
          '<strong class="ec-atc-toast__title">' + esc(title) + '</strong>',
          '<span class="ec-atc-toast__sub">Added to cart</span>',
        '</div>',
      '</div>',
      '<button class="ec-atc-toast__view" id="ec-atc-view-cart">View Cart</button>',
    ].join("");
    el.classList.add("ec-atc-toast--visible");
    var viewBtn = id("ec-atc-view-cart");
    if (viewBtn) {
      viewBtn.addEventListener("click", function () {
        el.classList.remove("ec-atc-toast--visible");
        openCart();
      });
    }
    if (atcToastTimer) clearTimeout(atcToastTimer);
    var secs = (settings && settings.addToCartToastSeconds) || 3;
    atcToastTimer = setTimeout(function () {
      el.classList.remove("ec-atc-toast--visible");
      atcToastTimer = null;
    }, secs * 1000);
  }

  function handlePostAdd(addedItem, cartAlreadyLoaded) {
    function proceed() {
      syncCartBadges();
      if (settings && settings.addToCartBehavior === "toast") {
        showAddToCartToast(addedItem);
      } else {
        render(); openCart();
      }
      syncFreebie();
    }
    if (cartAlreadyLoaded) {
      proceed();
    } else {
      loadCart().then(function (c) { cart = c; proceed(); });
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

  /* ── Freebie HTML — multi-offer ───────────────────────── */
  function buildFreebieHTML() {
    var offers = settings.freebieOffers || [];
    if (!offers.length) return "";

    var html = "";
    offers.forEach(function (offer) {
      if (!offer.enabled || !offer.productVariantId) return;
      var numId    = extractId(offer.productVariantId);
      var inCart   = cart.items.some(function (i) { return String(i.variant_id) === numId; });
      var unlocked = checkOffer(offer);

      /* In cart — shows as a line item; trigger removal if no longer unlocked */
      if (inCart) {
        if (!unlocked && !freebieAutoSync[offer.id]) syncOfferFreebie(offer);
        return;
      }

      /* Unlocked — auto-add silently */
      if (unlocked) {
        if (!freebieAutoSync[offer.id] && Date.now() >= (freebieRetryAt[offer.id] || 0)) {
          syncOfferFreebie(offer);
        }
        return;
      }

      /* Locked — show progress bar (only if merchant enabled it) */
      if (!settings.freebieProgressBarEnabled) return;
      var prog = offerProgress(offer);
      if (!prog || !prog.msg) return;
      html += [
        '<div class="ec-freebie ec-freebie--locked">',
          '<p class="ec-freebie__msg">' + esc(prog.msg) + '</p>',
          '<div class="ec-freebie__bar-track">',
            '<div class="ec-freebie__bar-fill" style="width:' + prog.pct + '%"></div>',
          '</div>',
        '</div>',
      ].join("");
    });

    return html;
  }

  /* ── Freebie auto-sync — multi-offer ─────────────────── */
  function syncFreebie() {
    if (!settings || !cart) return;
    var offers = settings.freebieOffers || [];
    offers.forEach(function (offer) {
      if (offer.enabled && offer.productVariantId) syncOfferFreebie(offer);
    });
    removeOrphanedFreebieItems();
  }

  /* Belt-and-suspenders: remove any cart item tagged _edge_cart_freebie that
     no longer belongs to an enabled, unlocked offer. Catches edge cases where
     syncOfferFreebie misses due to stale cart state or changed offer config. */
  function removeOrphanedFreebieItems() {
    if (!cart) return;
    var offers = (settings && settings.freebieOffers) || [];
    cart.items.forEach(function (item) {
      if (!item.properties || item.properties._edge_cart_freebie !== "true") return;
      var numId = String(item.variant_id);
      /* Find the offer that owns this freebie variant */
      var owningOffer = offers.find(function (o) {
        return o.enabled && o.productVariantId && extractId(o.productVariantId) === numId;
      });
      /* Remove if: no offer owns it, offer is disabled, or offer threshold not met */
      var shouldRemove = !owningOffer || !checkOffer(owningOffer);
      if (shouldRemove) {
        var syncKey = "orphan_" + item.key;
        if (!freebieAutoSync[syncKey]) {
          freebieAutoSync[syncKey] = true;
          cartChange(item.key, 0)
            .then(function () {
              freebieAutoSync[syncKey] = false;
              if (isOpen) render();
              syncCartBadges();
            })
            .catch(function () { freebieAutoSync[syncKey] = false; });
        }
      }
    });
  }

  function syncOfferFreebie(offer) {
    if (freebieAutoSync[offer.id]) return;
    if (!cart) return;

    var numId = extractId(offer.productVariantId);
    /* A freebie line is one we added with the _edge_cart_freebie tag — NOT just any
       line matching the variant. Matching by variant alone wrongly treats the
       customer's own PAID product (when it shares the freebie's variant) as the
       freebie, so removing the freebie deleted their paid item and adding looked
       like a duplicate. Identifying by the tag fixes both. */
    function isThisFreebie(i) {
      return i.properties && i.properties._edge_cart_freebie === "true" && String(i.variant_id) === numId;
    }
    var freebieItem = cart.items.find(isThisFreebie);
    var realItems   = cart.items.filter(function (i) { return !isThisFreebie(i); });

    if (!freebieItem && realItems.length === 0) return;

    var unlocked = checkOffer(offer);

    if (unlocked && !freebieItem) {
      if (Date.now() < (freebieRetryAt[offer.id] || 0)) return;

      freebieAutoSync[offer.id] = true;
      if (isOpen) renderBody();
      cartAdd(numId, 1, { _edge_cart_freebie: "true" })
        .then(function () {
          freebieAutoSync[offer.id] = false;
          freebieRetryAt[offer.id]  = 0;
          track("freebie_add", { variantId: offer.productVariantId, revenue: cart ? cart.total_price : 0 });
          showFreebieToast(offer);
          syncOfferFreebie(offer);
          if (isOpen) render();
          syncCartBadges();
        })
        .catch(function (err) {
          freebieAutoSync[offer.id] = false;
          freebieRetryAt[offer.id]  = 0;
          console.warn("[EdgeCart] Freebie auto-add failed:", err.message || err);
        });

    } else if (!unlocked && freebieItem) {
      freebieAutoSync[offer.id] = true;
      if (isOpen) renderBody();
      cartChange(freebieItem.key, 0)
        .then(function () {
          freebieAutoSync[offer.id] = false;
          freebieRetryAt[offer.id]  = 0;
          syncOfferFreebie(offer);
          if (isOpen) render();
          syncCartBadges();
        })
        .catch(function (err) {
          freebieAutoSync[offer.id] = false;
          console.warn("[EdgeCart] Freebie auto-remove failed:", err.message || err);
        });
    }
  }

  /* ── Max-exceeded toast — once per state change ──────────── */
  function syncMaxExceeded() {
    if (!settings || !cart) return;
    var offers = settings.freebieOffers || [];
    offers.forEach(function (offer) {
      if (!offer.enabled) return;
      var exceeded = isOfferMaxExceeded(offer);
      if (exceeded && !maxExceededNotified[offer.id]) {
        maxExceededNotified[offer.id] = true;
        var limitStr = offer.triggerType === "quantity"
          ? (offer.maxQuantity + " item" + (offer.maxQuantity !== 1 ? "s" : ""))
          : moneyVal(offer.maxCartValue * 100);
        showToast("ℹ️ Free gift applies to orders up to " + limitStr + " only", 10000, false);
      } else if (!exceeded) {
        maxExceededNotified[offer.id] = false;
      }
    });
  }

  function isOfferMaxExceeded(offer) {
    if (!cart) return false;
    var fid = offer.productVariantId ? extractId(offer.productVariantId) : null;
    if (offer.triggerType === "cartValue") {
      return !!(offer.maxCartValue && (cart.total_price / 100) > offer.maxCartValue);
    }
    if (offer.triggerType === "quantity") {
      if (!offer.maxQuantity) return false;
      var qty = cart.items.reduce(function (s, i) {
        return String(i.variant_id) === fid ? s : s + i.quantity;
      }, 0);
      return qty > offer.maxQuantity;
    }
    return false;
  }

  /* ── Free Shipping Progress Bar HTML ───────────────────── */
  function buildFreeShippingBarHTML() {
    if (!settings || !settings.freeShippingBarEnabled || !cart) return "";
    var threshold = settings.freeShippingThreshold || 50;
    var cartVal = cart.total_price / 100;
    var rem = Math.max(0, threshold - cartVal);
    var pct = Math.min(100, Math.round((cartVal / threshold) * 100));
    var unlocked = cartVal >= threshold;
    var msg = unlocked
      ? esc(settings.freeShippingUnlockedText || "You've unlocked free shipping!")
      : esc((settings.freeShippingText || "Add {{amount}} more for FREE shipping!").replace("{{amount}}", moneyVal(rem * 100)));
    return [
      '<div class="ec-free-ship">',
        '<p class="ec-free-ship__msg' + (unlocked ? ' ec-free-ship__msg--done' : '') + '">' + msg + '</p>',
        '<div class="ec-free-ship__track">',
          '<div class="ec-free-ship__fill" style="width:' + pct + '%"></div>',
        '</div>',
      '</div>',
    ].join("");
  }

  /* ── Volume Discount Table HTML ─────────────────────────── */
  function buildVolumeDiscountHTML() {
    var tiers = settings.volumeDiscounts || [];
    if (!tiers.length) return "";
    var itemCount = cart ? cart.item_count : 0;
    var rows = tiers.map(function (t) {
      var active = itemCount >= t.qty;
      return [
        '<tr class="' + (active ? 'ec-vd__row--active' : '') + '">',
          '<td class="ec-vd__cell">Buy ' + t.qty + '+</td>',
          '<td class="ec-vd__cell ec-vd__cell--pct">' + t.pct + '% off' + (active ? ' ✓' : '') + '</td>',
        '</tr>',
      ].join("");
    }).join("");
    return [
      '<div class="ec-vd">',
        '<p class="ec-vd__title">' + esc(settings.volumeDiscountTitle || "Buy more, save more!") + '</p>',
        '<table class="ec-vd__table"><tbody>' + rows + '</tbody></table>',
      '</div>',
    ].join("");
  }

  /* ── Gift Wrap HTML ─────────────────────────────────────── */
  function buildGiftWrapHTML(checked) {
    var price = settings.giftWrapPrice ? ' · ' + money(settings.giftWrapPrice) : '';
    var heading = settings.giftWrapHeading || 'Gift Options';
    return [
      '<div class="ec-gw" id="ec-gw">',
        '<p class="ec-gw__heading">' + esc(heading) + '</p>',
        '<label class="ec-gw__label">',
          '<input class="ec-gw__check" id="ec-gw-check" type="checkbox"' + (checked ? ' checked' : '') + '>',
          settings.giftWrapProductImageUrl
            ? '<img class="ec-gw__img" src="' + esc(settings.giftWrapProductImageUrl) + '" alt="" loading="lazy">'
            : '',
          '<div class="ec-gw__info">',
            '<span class="ec-gw__add-label">🎁 ' + esc(settings.giftWrapLabel || 'Add gift wrap') + '</span>',
            settings.giftWrapProductTitle
              ? '<span class="ec-gw__name">' + esc(settings.giftWrapProductTitle) + price + '</span>'
              : '',
          '</div>',
        '</label>',
      '</div>',
    ].join('');
  }

  /* ── Express Checkout Buttons HTML ─────────────────────── */
  function buildExpressCheckoutHTML() {
    var methods = [];
    if (settings.expressCheckoutShopPay)   methods.push({ label: "Shop Pay",   cls: "ec-express__shop-pay",   txt: "Shop Pay" });
    if (settings.expressCheckoutApplePay)  methods.push({ label: "Apple Pay",  cls: "ec-express__apple-pay",  txt: "Apple Pay" });
    if (settings.expressCheckoutGooglePay) methods.push({ label: "Google Pay", cls: "ec-express__google-pay", txt: "Google Pay" });
    if (!methods.length) return "";
    var url = checkoutUrl();
    var btns = methods.map(function (m) {
      return '<a class="ec-express__btn ' + m.cls + '" href="' + esc(url) + '">' + m.txt + '</a>';
    }).join("");
    return [
      '<div class="ec-express">',
        '<div class="ec-express__divider"><span>or pay with</span></div>',
        '<div class="ec-express__row">' + btns + '</div>',
      '</div>',
    ].join("");
  }

  /* ── Trust Badges HTML ──────────────────────────────────── */
  function buildTrustBadgesHTML() {
    var badges = settings.trustBadges || [];
    var enabled = badges.filter(function (b) { return b.enabled !== false; });
    if (!enabled.length) return "";
    var items = enabled.map(function (b) {
      return [
        '<div class="ec-trust__badge">',
          '<span class="ec-trust__icon">' + esc(b.icon || "") + '</span>',
          '<span class="ec-trust__text">' + esc(b.text || "") + '</span>',
        '</div>',
      ].join("");
    }).join("");
    return '<div class="ec-trust">' + items + '</div>';
  }

  /* ── Cart Share Link HTML ───────────────────────────────── */
  function buildCartShareHTML() {
    return [
      '<div class="ec-cart-share">',
        '<button class="ec-cart-share__btn" id="ec-cart-share-btn">',
          '🔗 ' + esc(settings.cartShareText || "Share your cart"),
        '</button>',
      '</div>',
    ].join("");
  }

  /* ── Cart Recovery / WhatsApp Share ─────────────────────── */
  var COUNTRIES = [
    ["🇺🇸","United States","1"],["🇬🇧","United Kingdom","44"],["🇮🇳","India","91"],
    ["🇦🇺","Australia","61"],["🇨🇦","Canada","1"],["🇩🇪","Germany","49"],
    ["🇫🇷","France","33"],["🇪🇸","Spain","34"],["🇮🇹","Italy","39"],
    ["🇧🇷","Brazil","55"],["🇲🇽","Mexico","52"],["🇦🇷","Argentina","54"],
    ["🇯🇵","Japan","81"],["🇰🇷","South Korea","82"],["🇨🇳","China","86"],
    ["🇸🇬","Singapore","65"],["🇦🇪","UAE","971"],["🇸🇦","Saudi Arabia","966"],
    ["🇿🇦","South Africa","27"],["🇳🇬","Nigeria","234"],["🇰🇪","Kenya","254"],
    ["🇳🇱","Netherlands","31"],["🇧🇪","Belgium","32"],["🇨🇭","Switzerland","41"],
    ["🇸🇪","Sweden","46"],["🇳🇴","Norway","47"],["🇩🇰","Denmark","45"],
    ["🇫🇮","Finland","358"],["🇵🇱","Poland","48"],["🇵🇹","Portugal","351"],
    ["🇬🇷","Greece","30"],["🇹🇷","Turkey","90"],["🇷🇺","Russia","7"],
    ["🇺🇦","Ukraine","380"],["🇮🇱","Israel","972"],["🇵🇰","Pakistan","92"],
    ["🇧🇩","Bangladesh","880"],["🇱🇰","Sri Lanka","94"],["🇳🇵","Nepal","977"],
    ["🇮🇩","Indonesia","62"],["🇲🇾","Malaysia","60"],["🇵🇭","Philippines","63"],
    ["🇹🇭","Thailand","66"],["🇻🇳","Vietnam","84"],["🇳🇿","New Zealand","64"],
    ["🇮🇪","Ireland","353"],["🇦🇹","Austria","43"],["🇨🇿","Czech Republic","420"],
    ["🇭🇺","Hungary","36"],["🇷🇴","Romania","40"],["🇪🇬","Egypt","20"],
    ["🇲🇦","Morocco","212"],["🇨🇴","Colombia","57"],["🇨🇱","Chile","56"],
    ["🇵🇪","Peru","51"],["🇭🇰","Hong Kong","852"],["🇹🇼","Taiwan","886"],
  ];

  function buildCountryOptions() {
    return COUNTRIES.map(function (c) {
      var selected = c[2] === waDialCode ? " selected" : "";
      return '<option value="' + c[2] + '"' + selected + '>' + c[0] + ' ' + c[1] + ' (+' + c[2] + ')</option>';
    }).join("");
  }

  function buildCartRecoveryHTML() {
    var cartUrl = "https://" + window.location.hostname + "/cart/" +
      cart.items.map(function (i) { return i.variant_id + ":" + i.quantity; }).join(",");
    var msg = (settings.cartRecoveryMessage || "Check out my cart: {{url}}").replace("{{url}}", cartUrl);
    var localDigits = waLocalNumber.replace(/[^0-9]/g, "");
    var canSend     = localDigits.length >= 6;
    return [
      '<div class="ec-recovery">',
        '<p class="ec-recovery__label">' + esc(settings.cartRecoveryLabel || "💬 Send cart link via WhatsApp") + '</p>',
        '<div class="ec-recovery__row">',
          '<select class="ec-recovery__cc" id="ec-wa-cc">' + buildCountryOptions() + '</select>',
          '<input class="ec-recovery__phone" id="ec-wa-num" type="tel" value="' + esc(waLocalNumber) + '" placeholder="Phone number" />',
          '<button class="ec-recovery__wa" id="ec-wa-send" data-msg="' + esc(msg) + '"' + (canSend ? "" : " disabled") + '>Send</button>',
        '</div>',
      '</div>',
    ].join("");
  }

  /* ── Delivery Date Estimator ─────────────────────────────── */
  function buildDeliveryEstimatorHTML() {
    var now  = new Date();
    var hour = now.getHours();
    var cutoff = settings.deliveryCutoffHour != null ? settings.deliveryCutoffHour : 14;
    var offset = hour >= cutoff ? 1 : 0;
    var minD = new Date(now); minD.setDate(minD.getDate() + (settings.deliveryMinDays || 3) + offset);
    var maxD = new Date(now); maxD.setDate(maxD.getDate() + (settings.deliveryMaxDays || 7) + offset);
    var fmtDate = function (d) { return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }); };
    var range = fmtDate(minD) + " – " + fmtDate(maxD);
    var txt = (settings.deliveryMessage || "Estimated delivery: {{date_range}}").replace("{{date_range}}", range);
    return '<div class="ec-delivery">🚚 ' + esc(txt) + '</div>';
  }

  /* ── Recently Viewed HTML (empty cart) ─────────────────── */
  function buildRecentlyViewedHTML() {
    var rv = [];
    try { rv = JSON.parse(localStorage.getItem("ec_rv") || "[]"); } catch (_) {}
    var limit = Math.min(Math.max(parseInt(settings.recentlyViewedLimit) || 4, 2), 6);
    var toShow = rv.filter(function(p) {
      return p && p.title && (p.handle || p.url);
    }).slice(0, limit);
    if (!toShow.length) return "";
    var cards = toShow.map(function (p) {
      var priceHtml = p.price ? '<p class="ec-rv-card__price">' + moneyVal(p.price) + '</p>' : '';
      var href = p.url || ("/products/" + p.handle);
      var imgHtml = p.imageUrl
        ? '<div class="ec-rv-card__img-wrap"><img class="ec-rv-card__img" src="' + esc(p.imageUrl) + '" alt="' + esc(p.title) + '" loading="lazy"></div>'
        : '<div class="ec-rv-card__img-wrap"><div class="ec-rv-card__img-placeholder"></div></div>';
      return '<a class="ec-rv-card" href="' + esc(href) + '">'
        + imgHtml
        + '<div class="ec-rv-card__body">'
        + '<p class="ec-rv-card__name">' + esc(p.title) + '</p>'
        + priceHtml
        + '</div>'
        + '</a>';
    }).join("");
    return '<div class="ec-empty-rv">'
      + '<div class="ec-empty-rv__top">'
      + '<div class="ec-empty-rv__icon">🛒</div>'
      + '<p class="ec-empty__text">Your cart is empty</p>'
      + '<p class="ec-empty__sub">Here\'s what you were looking at</p>'
      + '</div>'
      + '<div class="ec-rv">'
      + '<p class="ec-rv__title">' + esc(settings.recentlyViewedTitle || "Recently Viewed") + '</p>'
      + '<div class="ec-rv__grid">' + cards + '</div>'
      + '</div>'
      + '</div>';
  }

  /* ── Track recently viewed products ─────────────────────── */
  function trackRecentlyViewed() {
    if (!settings || !settings.recentlyViewedEnabled) return;
    if (window.location.pathname.indexOf("/products/") === -1) return;

    /* Handle from URL — most reliable */
    var pathParts = window.location.pathname.split("/products/");
    var handle = pathParts[1] ? pathParts[1].split("/")[0].split("?")[0] : "";
    if (!handle) return;

    /* Meta for title/price */
    var meta = (window.ShopifyAnalytics && window.ShopifyAnalytics.meta && window.ShopifyAnalytics.meta.product)
      || (window.meta && window.meta.product) || {};

    /* Try DOM for image first — fastest, no extra request */
    var imgUrl = "";
    var imgEl = document.querySelector(
      ".product__media img, .product-single__photo img, .product-featured-img, " +
      ".product__photo img, [data-product-featured-image], .product-gallery__image img, " +
      ".product-image img, .product__image img, .product-media img, " +
      ".product-single__media img, [class*='product'] img[src*='cdn.shopify']"
    );
    if (imgEl && imgEl.src && imgEl.src.indexOf("data:") === -1) {
      imgUrl = imgEl.src.replace(/(_\d+x[\d]*)(\.[a-z]+)(\?|$)/gi, "$2$3")
                        .replace(/\?.*$/, "") + "?width=300";
    }

    var entry = {
      handle:   handle,
      title:    meta.title || (document.querySelector("h1") || {}).textContent || handle,
      imageUrl: imgUrl,
      price:    meta.price || (meta.variants && meta.variants[0] && meta.variants[0].price) || 0,
      url:      window.location.pathname,
    };

    var rv = [];
    try { rv = JSON.parse(localStorage.getItem("ec_rv") || "[]"); } catch (_) {}
    rv = rv.filter(function (p) { return p.handle !== handle; });
    rv.unshift(entry);
    if (rv.length > 10) rv = rv.slice(0, 10);
    try { localStorage.setItem("ec_rv", JSON.stringify(rv)); } catch (_) {}

    /* Fetch product JSON in background to fill in missing image/price */
    if (!imgUrl || !entry.price) {
      fetch("/products/" + handle + ".js", { credentials: "same-origin" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (!data) return;
          var saved = [];
          try { saved = JSON.parse(localStorage.getItem("ec_rv") || "[]"); } catch (_) {}
          for (var i = 0; i < saved.length; i++) {
            if (saved[i].handle !== handle) continue;
            if (!saved[i].imageUrl && data.featured_image) {
              saved[i].imageUrl = data.featured_image.replace(/\?.*$/, "") + "?width=300";
            }
            if (!saved[i].price && data.variants && data.variants[0]) {
              saved[i].price = data.variants[0].price;
            }
            if (data.title) saved[i].title = data.title;
            break;
          }
          try { localStorage.setItem("ec_rv", JSON.stringify(saved)); } catch (_) {}
        })
        .catch(function () {});
    }
  }

  /* ── Fetch inventory for stock scarcity ─────────────────── */
  function fetchInventoryForItems() {
    if (!cart || !settings || !settings.stockScarcityEnabled) return;
    var fetched = false;
    cart.items.forEach(function (item) {
      if (isFreebieItem(item)) return;
      if (inventoryCache[item.variant_id] !== undefined) return;
      if (!item.handle) return;
      if (inventoryFetching[item.handle]) return;
      inventoryFetching[item.handle] = true;
      fetched = true;
      var handle = item.handle;
      fetch("/products/" + handle + ".js", { credentials: "same-origin" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          delete inventoryFetching[handle];
          if (!data || !data.variants) return;
          data.variants.forEach(function (v) {
            inventoryCache[v.id] = v.inventory_management === "shopify" ? v.inventory_quantity : null;
          });
          /* Surgical patch — only touch badge nodes, never rebuild the whole body */
          if (isOpen) patchScarcityBadges();
        })
        .catch(function () { delete inventoryFetching[handle]; });
    });
    return fetched;
  }

  /* Update only the scarcity badge <span> inside each rendered line item.
     Avoids replacing body.innerHTML (which causes the visible "shake"). */
  function patchScarcityBadges() {
    var body = id("ec-body");
    if (!body || !cart || !settings) return;
    var threshold = parseInt(settings.stockScarcityThreshold) || 5;
    var template  = settings.stockScarcityText || "Only {{count}} left!";
    cart.items.forEach(function (item) {
      if (isFreebieItem(item)) return;
      var itemEl = body.querySelector('.ec-item[data-key="' + item.key + '"]');
      if (!itemEl) return;
      var info     = itemEl.querySelector(".ec-item__info");
      if (!info) return;
      var existing = info.querySelector(".ec-item__scarcity");
      var invQty   = inventoryCache[item.variant_id];
      var show     = invQty !== undefined && invQty !== null &&
                     typeof invQty === "number" && invQty > 0 && invQty <= threshold;
      if (show) {
        var txt = template.replace("{{count}}", String(invQty));
        if (existing) {
          if (existing.textContent !== txt) existing.textContent = txt;
        } else {
          var badge = document.createElement("span");
          badge.className = "ec-item__scarcity";
          badge.textContent = txt;
          info.appendChild(badge);
        }
      } else {
        if (existing) existing.remove();
      }
    });
  }

  /* ── Sticky Add-to-Cart ──────────────────────────────────── */
  function initStickyAtc() {
    if (!settings || !settings.stickyAtcEnabled) return;
    if (window.location.pathname.indexOf("/products/") === -1) return;

    var stickyBar = document.createElement("div");
    stickyBar.id = "ec-sticky-atc";
    stickyBar.className = "ec-sticky-atc";
    stickyBar.innerHTML = [
      '<div class="ec-sticky-atc__inner">',
        '<span class="ec-sticky-atc__title" id="ec-sticky-title"></span>',
        '<button class="ec-sticky-atc__btn" id="ec-sticky-btn">' + esc(settings.stickyAtcText || "Add to Cart") + '</button>',
      '</div>',
    ].join("");
    document.body.appendChild(stickyBar);

    var productTitle = document.querySelector("h1.product__title, h1.product-single__title, h1[class*='product']");
    var titleEl = document.getElementById("ec-sticky-title");
    if (titleEl && productTitle) titleEl.textContent = productTitle.textContent.trim();

    var nativeBtn = document.querySelector('[name="add"], button[type="submit"][data-add-to-cart], .product-form__submit');
    if (!nativeBtn) return;

    var observer = new IntersectionObserver(function (entries) {
      var visible = entries[0] && entries[0].isIntersecting;
      stickyBar.classList.toggle("ec-sticky-atc--visible", !visible);
    }, { threshold: 0.1 });
    observer.observe(nativeBtn);

    var stickyBtn = document.getElementById("ec-sticky-btn");
    if (stickyBtn) {
      stickyBtn.addEventListener("click", function () {
        var form = nativeBtn.closest("form[action*='/cart/add']") || document.querySelector("form[action*='/cart/add']");
        if (form) {
          var fd = new FormData(form);
          var vid = fd.get("id");
          var qty = parseInt(fd.get("quantity") || "1", 10);
          if (vid) {
            stickyBtn.disabled = true;
            stickyBtn.textContent = "Adding…";
            cartAdd(vid, qty, {})
              .then(function (item) { handlePostAdd(item, true); })
              .catch(function () { form.submit(); })
              .finally(function () {
                stickyBtn.disabled = false;
                stickyBtn.textContent = settings.stickyAtcText || "Add to Cart";
              });
            return;
          }
        }
        nativeBtn.click();
      });
    }
  }

  /* ===========================================================
     PRODUCT PAGE FEATURES
  =========================================================== */
  function initProductPage() {
    if (!settings) return;
    if (window.location.pathname.indexOf("/products/") === -1) return;
    /* Small delay so the theme has finished rendering its DOM */
    setTimeout(function () {
      if (settings.productPageSocialProofEnabled)                         initSocialProof();
      if (settings.productPageScarcityEnabled)                             initProductScarcity();
      if (settings.productPageVolumeTableEnabled && settings.volumeDiscountEnabled) initProductVolumeTable();
      if (settings.productPageFreebieTeaser)                               initProductFreebieTeaser();
      if (settings.productPageUpsellEnabled)                               initProductUpsell();
    }, 600);
  }

  /* Find the add-to-cart form — works across all Shopify themes */
  function findAtcForm() {
    return document.querySelector('form[action*="/cart/add"], form[action="/cart/add"]');
  }

  /* Returns true if el looks like a Buy Now / payment button element */
  function isPaymentEl(el) {
    if (!el || !el.tagName) return false;
    var tag = el.tagName.toLowerCase();
    var cls = (typeof el.className === "string") ? el.className.toLowerCase() : "";
    return tag === "payment-button" ||
      tag === "shopify-payment-button" ||
      cls.indexOf("payment") !== -1 ||
      cls.indexOf("buy-now") !== -1 ||
      cls.indexOf("dynamic-checkout") !== -1 ||
      !!el.querySelector("shopify-payment-button, payment-button, [data-shopify='payment-button']");
  }

  /* Find the last element that should appear before our injection.
     Works across all themes: Dawn (payment-button sibling of product-form),
     Debut (payment button inside form), Impulse, Horizon, etc. */
  function findInsertionAnchor() {
    var form = findAtcForm();
    if (!form) return null;

    /* Strategy 1: find any shopify-payment-button that follows the form in the document */
    var allPay = document.querySelectorAll(
      "shopify-payment-button, payment-button, [data-shopify='payment-button']"
    );
    for (var pi = allPay.length - 1; pi >= 0; pi--) {
      var btn = allPay[pi];
      /* compareDocumentPosition bit 4 = DOCUMENT_POSITION_FOLLOWING */
      if (form.compareDocumentPosition(btn) & 4) {
        return { anchor: btn, parent: btn.parentNode };
      }
    }

    /* Strategy 2: walk up to 3 DOM levels from the form, check next siblings at each level */
    var el = form;
    for (var level = 0; level < 3; level++) {
      var sib = el.nextElementSibling;
      var steps = 0;
      while (sib && steps < 8) {
        if (isPaymentEl(sib)) return { anchor: sib, parent: sib.parentNode };
        sib = sib.nextElementSibling;
        steps++;
      }
      if (!el.parentNode || el.parentNode === document.body) break;
      el = el.parentNode;
    }

    /* Strategy 3: fall back to inserting after the form */
    return { anchor: form, parent: form.parentNode };
  }

  /* Insert element immediately after the ATC form */
  function insertAfterAtc(html) {
    var form = findAtcForm();
    if (!form) return null;
    var wrap = document.createElement("div");
    wrap.innerHTML = html;
    var el = wrap.firstChild;
    form.parentNode.insertBefore(el, form.nextSibling);
    return el;
  }

  /* Insert element immediately before the ATC form */
  function insertBeforeAtc(html) {
    var form = findAtcForm();
    if (!form) return null;
    var wrap = document.createElement("div");
    wrap.innerHTML = html;
    var el = wrap.firstChild;
    form.parentNode.insertBefore(el, form);
    return el;
  }

  /* ── 1. Social Proof Notifications ──────────────────────── */
  function initSocialProof() {
    var toast = document.createElement("div");
    toast.id = "ec-sp-toast";
    toast.className = "ec-sp-toast";
    document.body.appendChild(toast);

    var min      = settings.productPageSocialProofMin      || 5;
    var max      = settings.productPageSocialProofMax      || 30;
    var interval = (settings.productPageSocialProofInterval || 8) * 1000;
    var template = settings.productPageSocialProofText || "🔥 {{count}} people bought this today";
    var count    = Math.floor(Math.random() * (max - min + 1)) + min;

    function showProof() {
      count += 1;
      if (count > max) count = min + Math.floor(Math.random() * 3);
      toast.textContent = template.replace("{{count}}", count);
      toast.classList.add("ec-sp-toast--visible");
      setTimeout(function () { toast.classList.remove("ec-sp-toast--visible"); }, 3500);
    }

    setTimeout(showProof, 2000);
    setInterval(showProof, interval);
  }

  /* ── 2. Product Scarcity Badge ───────────────────────────── */
  function initProductScarcity() {
    var threshold = settings.stockScarcityThreshold || 5;
    var template  = settings.stockScarcityText || "Only {{count}} left!";
    var match     = window.location.pathname.match(/\/products\/([^/?#]+)/);
    var handle    = match ? match[1] : null;
    if (!handle) return;

    fetch("/products/" + handle + ".js")
      .then(function (r) { return r.json(); })
      .then(function (product) {
        var selInput = document.querySelector('input[name="id"], select[name="id"]');
        var selId    = selInput ? String(selInput.value) : null;
        var variant  = (selId && product.variants.find(function (v) { return String(v.id) === selId; }))
                     || product.variants[0];
        if (!variant) return;
        var qty = variant.inventory_quantity;
        if (variant.inventory_management !== "shopify" || qty == null || typeof qty !== "number" || qty > threshold || qty <= 0) return;
        var badge = document.createElement("div");
        badge.className = "ec-pp-scarcity";
        badge.innerHTML = "⚠️ " + esc(template.replace("{{count}}", qty));
        var form = findAtcForm();
        if (form) form.parentNode.insertBefore(badge, form.nextSibling);
      })
      .catch(function () {});
  }

  /* ── 3. Volume Discount Table ────────────────────────────── */
  function initProductVolumeTable() {
    var tiers = settings.volumeDiscounts || [];
    if (!tiers.length) return;

    var html  = '<div class="ec-pp-volume">';
    html += '<p class="ec-pp-volume__title">' + esc(settings.volumeDiscountTitle || "Buy more, save more!") + '</p>';
    html += '<div class="ec-pp-volume__grid">';
    tiers.forEach(function (t) {
      html += '<div class="ec-pp-volume__tier">'
            + '<span class="ec-pp-volume__qty">Buy ' + t.qty + '+</span>'
            + '<span class="ec-pp-volume__pct">' + t.pct + '% off</span>'
            + '</div>';
    });
    html += '</div></div>';
    insertBeforeAtc(html);
  }

  /* ── 4. Free Gift Teaser ─────────────────────────────────── */
  function initProductFreebieTeaser() {
    var offers = settings.freebieOffers || [];
    var offer  = offers.find(function (o) { return o.enabled !== false && o.triggerType === "cartValue"; });
    if (!offer) offer = offers.find(function (o) { return o.enabled !== false && o.minCartValue; });
    if (!offer && settings.freebieMinCartValue) {
      offer = { minCartValue: settings.freebieMinCartValue };
    }
    if (!offer) return;

    fetch("/cart.js")
      .then(function (r) { return r.json(); })
      .then(function (c) {
        var threshold = offer.minCartValue || 100;
        var needed    = threshold - (c.total_price / 100);
        if (needed <= 0) return;
        var html = '<div class="ec-pp-freebie">🎁 Add ' + money(Math.round(needed * 100)) + ' more to unlock a free gift!</div>';
        insertAfterAtc(html);
      })
      .catch(function () {});
  }

  /* ── 5. Product Page Upsell ──────────────────────────────── */
  function initProductUpsell() {
    var title   = settings.productPageUpsellTitle || "Customers Also Bought";
    var limit   = settings.productPageUpsellLimit || 3;
    var manual  = settings.productPageUpsellProducts || [];

    if (manual.length > 0) {
      var products = manual.slice(0, limit);
      /* Auto-fill missing or non-HTTP images by fetching /products/{handle}.json */
      var needsImage = products.filter(function(p) { return (!p.imageUrl || !/^https?:\/\//.test(p.imageUrl)) && p.handle; });
      if (needsImage.length === 0) {
        renderProductPageUpsell(title, products);
        return;
      }
      var pending = needsImage.length;
      needsImage.forEach(function(p) {
        fetch("/products/" + p.handle + ".json")
          .then(function(r) { return r.json(); })
          .then(function(data) {
            if (data && data.product && data.product.images && data.product.images[0]) {
              p.imageUrl = data.product.images[0].src || "";
            }
          })
          .catch(function() {})
          .finally(function() {
            pending--;
            if (pending === 0) renderProductPageUpsell(title, products);
          });
      });
      return;
    }

    /* Get product numeric ID from Shopify analytics or page meta */
    var productId = null;
    try {
      if (window.ShopifyAnalytics && window.ShopifyAnalytics.meta && window.ShopifyAnalytics.meta.product) {
        productId = window.ShopifyAnalytics.meta.product.id;
      }
    } catch (_) {}
    if (!productId) {
      var jsonEl = document.querySelector('[data-product-json], #ProductJson-product-template, #product-json');
      if (jsonEl) { try { productId = JSON.parse(jsonEl.textContent).id; } catch (_) {} }
    }
    if (!productId) return;

    fetch("/recommendations/products.json?product_id=" + productId + "&limit=" + limit + "&intent=related")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.products || !data.products.length) return;
        var products = data.products.slice(0, limit).map(function (p) {
          var v = p.variants && p.variants[0];
          /* featured_image is often a direct URL string on recommendations responses */
          var imgSrc = (p.featured_image && (p.featured_image.url || p.featured_image)) ||
                       (p.images && p.images[0] && (p.images[0].src || p.images[0].url || p.images[0].originalSrc || "")) ||
                       "";
          if (imgSrc && imgSrc.indexOf("//") === 0) imgSrc = "https:" + imgSrc;
          return {
            title:        p.title,
            handle:       p.handle,
            imageUrl:     typeof imgSrc === "string" ? imgSrc : "",
            price:        v ? (v.price || 0) : (p.price || 0),
            comparePrice: v && v.compare_at_price > v.price ? v.compare_at_price : 0,
            variantId:    v ? v.id : null,
          };
        });
        /* Auto-fetch images for any product still missing one */
        var needsImg = products.filter(function(p) { return (!p.imageUrl || !/^https?:\/\//.test(p.imageUrl)) && p.handle; });
        if (needsImg.length === 0) { renderProductPageUpsell(title, products); return; }
        var pending = needsImg.length;
        needsImg.forEach(function(p) {
          fetch("/products/" + p.handle + ".json")
            .then(function(r) { return r.json(); })
            .then(function(d) {
              if (d && d.product && d.product.images && d.product.images[0]) {
                p.imageUrl = d.product.images[0].src || "";
              }
            })
            .catch(function() {})
            .finally(function() { if (--pending === 0) renderProductPageUpsell(title, products); });
        });
      })
      .catch(function () {});
  }

  function renderProductPageUpsell(title, products) {
    if (!products.length) return;
    if (document.getElementById("ec-pp-upsell")) return; /* already injected */

    var cards = products.map(function (p) {
      var href  = "/products/" + (p.handle || "");
      var disc  = p.comparePrice && p.comparePrice > p.price
        ? Math.round((1 - p.price / p.comparePrice) * 100) : 0;
      var imgHtml = p.imageUrl
        ? '<img class="ec-pp-upsell__img" src="' + esc(p.imageUrl) + '" alt="' + esc(p.title) + '" loading="lazy">'
        : '<div class="ec-pp-upsell__img-ph"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>';
      return [
        '<div class="ec-pp-upsell__card">',
          '<a href="' + esc(href) + '" class="ec-pp-upsell__img-wrap">',
            imgHtml,
            disc > 0 ? '<span class="ec-pp-upsell__disc-badge">−' + disc + '%</span>' : "",
          '</a>',
          '<div class="ec-pp-upsell__body">',
            '<a href="' + esc(href) + '" class="ec-pp-upsell__name-link">',
              '<p class="ec-pp-upsell__name">' + esc(p.title) + '</p>',
            '</a>',
            '<div class="ec-pp-upsell__pricing">',
              '<span class="ec-pp-upsell__price">' + money(p.price) + '</span>',
              disc > 0 ? '<span class="ec-pp-upsell__compare">' + money(p.comparePrice) + '</span>' : "",
            '</div>',
            '<button class="ec-pp-upsell__btn" data-vid="' + esc(extractId(String(p.variantId || ""))) + '">',
              '<svg class="ec-pp-upsell__cart-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>',
              '<span>Add to Cart</span>',
            '</button>',
          '</div>',
        '</div>',
      ].join("");
    }).join("");

    var html = [
      '<div class="ec-pp-upsell" id="ec-pp-upsell">',
        '<div class="ec-pp-upsell__header">',
          '<div class="ec-pp-upsell__title-row">',
            '<span class="ec-pp-upsell__title-icon">✦</span>',
            '<h3 class="ec-pp-upsell__title">' + esc(title) + '</h3>',
            '<span class="ec-pp-upsell__title-icon">✦</span>',
          '</div>',
        '</div>',
        '<div class="ec-pp-upsell__track" id="ec-pp-upsell-track">',
          cards,
        '</div>',
        '<div class="ec-pp-upsell__dots" id="ec-pp-upsell-dots"></div>',
      '</div>',
    ].join("");

    /* Inject below ATC form AND any Buy Now / payment buttons */
    var anchor = findInsertionAnchor();
    if (anchor) {
      var wrap = document.createElement("div");
      wrap.innerHTML = html;
      anchor.parent.insertBefore(wrap.firstChild, anchor.anchor.nextSibling);
    } else {
      document.body.insertAdjacentHTML("beforeend", html);
    }

    /* Dot pagination for mobile */
    var track     = document.getElementById("ec-pp-upsell-track");
    var dotsWrap  = document.getElementById("ec-pp-upsell-dots");
    if (track && dotsWrap && products.length > 1) {
      products.forEach(function (_, i) {
        var dot = document.createElement("button");
        dot.className = "ec-pp-upsell__dot" + (i === 0 ? " ec-pp-upsell__dot--active" : "");
        dot.setAttribute("aria-label", "Go to slide " + (i + 1));
        dotsWrap.appendChild(dot);
        dot.addEventListener("click", function () {
          var cards2 = track.querySelectorAll(".ec-pp-upsell__card");
          if (cards2[i]) cards2[i].scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
        });
      });
      track.addEventListener("scroll", function () {
        var dots2 = dotsWrap.querySelectorAll(".ec-pp-upsell__dot");
        var cards2 = track.querySelectorAll(".ec-pp-upsell__card");
        var closest = 0, minDist = Infinity;
        cards2.forEach(function (c, i) {
          var dist = Math.abs(c.getBoundingClientRect().left - track.getBoundingClientRect().left);
          if (dist < minDist) { minDist = dist; closest = i; }
        });
        dots2.forEach(function (d, i) { d.classList.toggle("ec-pp-upsell__dot--active", i === closest); });
      });
    }

    /* Bind Add to Cart buttons */
    var upsellSection = document.getElementById("ec-pp-upsell");
    if (!upsellSection) return;
    upsellSection.querySelectorAll(".ec-pp-upsell__btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var vid = btn.getAttribute("data-vid");
        if (!vid) return;
        btn.disabled = true;
        btn.querySelector("span").textContent = "Adding…";
        cartAdd(vid, 1, {})
          .then(function (item) {
            handlePostAdd(item, true);
            btn.querySelector("span").textContent = "Added ✓";
          })
          .catch(function () {
            var s = btn.querySelector("span"); if (s) s.textContent = "Add to Cart";
          })
          .finally(function () {
            setTimeout(function () {
              btn.disabled = false;
              var s = btn.querySelector("span"); if (s) s.textContent = "Add to Cart";
            }, 2000);
          });
      });
    });
  }

  /* ── One-Click Upsell HTML ──────────────────────────────── */
  function buildOcuHTML(checked) {
    var price = settings.ocuProductPrice ? ' · ' + money(settings.ocuProductPrice) : '';
    var heading = settings.ocuHeading || 'Complete your order';
    return [
      '<div class="ec-ocu" id="ec-ocu">',
        '<p class="ec-ocu__heading">' + esc(heading) + '</p>',
        '<label class="ec-ocu__label">',
          '<input class="ec-ocu__check" id="ec-ocu-check" type="checkbox"' + (checked ? ' checked' : '') + '>',
          settings.ocuProductImageUrl
            ? '<img class="ec-ocu__img" src="' + esc(settings.ocuProductImageUrl) + '" alt="" loading="lazy">'
            : '',
          '<div class="ec-ocu__info">',
            '<span class="ec-ocu__add-label">' + esc(settings.ocuLabel || 'Add to your order') + '</span>',
            settings.ocuProductTitle
              ? '<span class="ec-ocu__name">' + esc(settings.ocuProductTitle) + price + '</span>'
              : '',
          '</div>',
        '</label>',
      '</div>',
    ].join('');
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
      var vid      = extractId(v.id);
      var price    = v.price ? moneyDollars(v.price) : "";
      var compare  = v.compareAtPrice && parseFloat(v.compareAtPrice) > parseFloat(v.price) ? moneyDollars(v.compareAtPrice) : "";
      var priceHTML = compare
        ? '<p class="ec-upsell-card__price"><s>' + compare + '</s> ' + price + '</p>'
        : (price ? '<p class="ec-upsell-card__price">' + price + '</p>' : "");
      var img   = p.featuredImage && p.featuredImage.url ? p.featuredImage.url : "";
      var handle = p.handle || "";
      return [
        '<div class="ec-upsell-card" data-handle="' + esc(handle) + '" data-variant="' + esc(vid) + '">',
          img
            ? '<img class="ec-upsell-card__img" src="' + esc(img) + '" alt="' + esc(p.title) + '" loading="lazy">'
            : '<div class="ec-upsell-card__img-placeholder"></div>',
          '<div class="ec-upsell-card__body">',
            '<p class="ec-upsell-card__name">' + esc(p.title) + '</p>',
            priceHTML,
            '<button class="ec-upsell-card__add" data-action="upsell" data-variant="' + esc(vid) + '" aria-label="Add ' + esc(p.title) + '">+ Add</button>',
          '</div>',
        '</div>',
      ].join("");
    }).join("");

    if (!cards) return "";
    return [
      '<div class="ec-upsell-wrap">',
        '<p class="ec-upsell-wrap__heading">' + esc(settings.upsellTitle || "You might also like") + '</p>',
        '<div class="ec-upsell-scroller">',
          '<div class="ec-upsell-track">' + cards + '</div>',
          (settings.upsellSliderEnabled !== false
            ? '<button class="ec-upsell-nav ec-upsell-nav--left" data-action="upsell-scroll" data-dir="-1" aria-label="Scroll left">‹</button>' +
              '<button class="ec-upsell-nav ec-upsell-nav--right" data-action="upsell-scroll" data-dir="1" aria-label="Scroll right">›</button>'
            : ''),
        '</div>',
      '</div>',
    ].join("");
  }

  /* ── Live price + availability refresh for static upsell ── */
  function refreshUpsellLiveData() {
    var footer = id("ec-footer");
    if (!footer) return;
    var cards = footer.querySelectorAll(".ec-upsell-card[data-handle]");
    if (!cards.length) return;

    /* Batch by handle — one fetch per unique product */
    var handles = {};
    cards.forEach(function (card) {
      var h = card.getAttribute("data-handle");
      if (h && !handles[h]) handles[h] = [];
      if (h) handles[h].push(card);
    });

    Object.keys(handles).forEach(function (handle) {
      fetch("/products/" + encodeURIComponent(handle) + ".json", { credentials: "same-origin" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (!data || !data.product) return;
          var product = data.product;

          handles[handle].forEach(function (card) {
            var vid = card.getAttribute("data-variant");
            var variant = product.variants.find(function (v) { return String(v.id) === String(vid); });
            if (!variant) return;

            /* Update price — /products/handle.json returns prices as decimal strings
               e.g. "3000.00", so pass directly to moneyDollars (no *100 needed) */
            var priceEl = card.querySelector(".ec-upsell-card__price");
            var livePrice   = moneyDollars(variant.price);
            var liveCompare = variant.compare_at_price && parseFloat(variant.compare_at_price) > parseFloat(variant.price)
              ? moneyDollars(variant.compare_at_price) : "";
            var newPriceHTML = liveCompare
              ? '<s>' + liveCompare + '</s> ' + livePrice
              : livePrice;
            if (priceEl) {
              priceEl.innerHTML = newPriceHTML;
            } else if (livePrice) {
              var body = card.querySelector(".ec-upsell-card__body");
              if (body) {
                var p = document.createElement("p");
                p.className = "ec-upsell-card__price";
                p.innerHTML = newPriceHTML;
                var btn = body.querySelector(".ec-upsell-card__add");
                if (btn) body.insertBefore(p, btn); else body.appendChild(p);
              }
            }

            /* Update availability */
            var available = variant.available !== false;
            var btn = card.querySelector(".ec-upsell-card__add");
            if (btn && !available) {
              btn.disabled = true;
              btn.textContent = "Sold Out";
              btn.classList.add("ec-upsell-card__add--sold-out");
            } else if (btn) {
              /* Re-enable if it was previously marked sold out */
              if (btn.classList.contains("ec-upsell-card__add--sold-out")) {
                btn.disabled = false;
                btn.textContent = "+ Add";
                btn.classList.remove("ec-upsell-card__add--sold-out");
              }
            }
          });
        })
        .catch(function () { /* silent — stale price stays shown */ });
    });
  }

  /* ── AI Upsell — Shopify Recommendations API ────────────── */
  async function fetchAiRecommendations() {
    if (!settings || !settings.aiUpsellEnabled) { aiRecommendations = []; return; }
    if (!cart || !cart.items.length)             { aiRecommendations = []; return; }
    if (aiRecommendationsFetching) return;

    /* Seed: non-freebie item with highest line price */
    var seed = null;
    cart.items.forEach(function (item) {
      if (getFreebieOffer(item)) return;
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
      /* Recommendations API returns featured_image as a string URL.
         Prices are integers in cents (same as /cart.js) — use moneyVal directly. */
      var img      = (typeof p.featured_image === "string" ? p.featured_image : "")
                  || (p.images && p.images[0] && p.images[0].src) || "";
      var price    = v.price ? moneyVal(v.price) : "";
      var compare  = v.compare_at_price && v.compare_at_price > v.price ? moneyVal(v.compare_at_price) : "";
      var priceHTML = compare
        ? '<p class="ec-upsell-card__price"><s>' + compare + '</s> ' + price + '</p>'
        : (price ? '<p class="ec-upsell-card__price">' + price + '</p>' : "");
      return [
        '<div class="ec-upsell-card">',
          img
            ? '<img class="ec-upsell-card__img" src="' + esc(img) + '" alt="' + esc(p.title) + '" loading="lazy">'
            : '<div class="ec-upsell-card__img-placeholder"></div>',
          '<div class="ec-upsell-card__body">',
            '<p class="ec-upsell-card__name">' + esc(p.title) + '</p>',
            priceHTML,
            '<button class="ec-upsell-card__add" data-action="upsell" data-variant="' + esc(String(v.id)) + '" aria-label="Add ' + esc(p.title) + '">+ Add</button>',
          '</div>',
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
  function checkOffer(offer) {
    if (!cart || !offer || !offer.enabled) return false;
    var fid = offer.productVariantId ? extractId(offer.productVariantId) : null;
    var t   = offer.triggerType;

    var productIds = (offer.triggerProductIds || []).map(function (p) {
      return extractId(typeof p === "object" ? p.id : p);
    });
    var hasProductCond = productIds.length > 0;

    function productMet() {
      return cart.items.some(function (i) {
        return String(i.variant_id) !== fid && productIds.indexOf(String(i.product_id)) !== -1;
      });
    }

    if (t === "product") return productMet();

    var primaryMet = false;
    if (t === "cartValue") {
      var total = cart.total_price / 100;
      primaryMet = total >= offer.minCartValue &&
                   (!offer.maxCartValue || total <= offer.maxCartValue);
    } else if (t === "quantity") {
      var qty = cart.items.reduce(function (sum, i) {
        return String(i.variant_id) === fid ? sum : sum + i.quantity;
      }, 0);
      primaryMet = qty >= offer.minQuantity &&
                   (!offer.maxQuantity || qty <= offer.maxQuantity);
    }

    if (!hasProductCond) return primaryMet;

    var logic = offer.conditionLogic || "AND";
    return logic === "OR" ? primaryMet || productMet() : primaryMet && productMet();
  }

  function offerProgress(offer) {
    if (!cart || !offer) return null;
    var fid = offer.productVariantId ? extractId(offer.productVariantId) : null;
    var t   = offer.triggerType;

    if (t === "cartValue") {
      var cur    = cart.total_price / 100;
      var target = offer.minCartValue;
      var max    = offer.maxCartValue;
      /* Max exceeded — handled by syncMaxExceeded() toast, not inline text */
      if (max && cur > max) return null;
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
      var targetQ = offer.minQuantity;
      var maxQ    = offer.maxQuantity;
      /* Max exceeded — handled by syncMaxExceeded() toast, not inline text */
      if (maxQ && curQ > maxQ) return null;
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
    track("cart_open");
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
    startAnnouncementTimer();
    prefetchAnnouncementCollections();
  }

  function closeCart() {
    isOpen = false;
    var drawer  = id("ec-cart");
    var overlay = id("ec-overlay");
    if (drawer)  drawer.classList.remove("ec-cart--open");
    if (overlay) overlay.classList.remove("ec-overlay--visible");
    document.body.style.overflow = "";
    if (scarcityTimer) { clearInterval(scarcityTimer); scarcityTimer = null; }
    stopAnnouncementTimer();
  }

  /* ===========================================================
     THEME CART ICON REPLACEMENT
     Hides the theme's native cart icon and injects our own
     fancy button in its place, complete with a live item badge.
  =========================================================== */
  function replaceThemeCartIcon() {
    /* Theme name → CSS selector for that theme's cart icon button/link.
       All three (Horizon, Tinker, Savor) share the same class. */
    var THEME_MAP = {
      "horizon": ".header-actions__cart-icon",
      "tinker":  ".header-actions__cart-icon",
      "savor":   ".header-actions__cart-icon",
      "dawn":    "#cart-icon-bubble",
      "sense":   "#cart-icon-bubble",
      "craft":   ".header__cart",
      "studio":  ".header__cart",
      "spotlight": ".header__cart",
      "refresh": ".cart__icon",
      "crave":   ".js-cart-open",
      "origin":  ".header__cart-toggle",
      "impulse": ".site-header__cart",
      "turbo":   ".site-header__cart",
    };

    var themeName = (window.Shopify && window.Shopify.theme && window.Shopify.theme.name)
      ? window.Shopify.theme.name.toLowerCase().trim()
      : "";

    /* Priority: 1. merchant custom, 2. built-in map, 3. broad fallbacks */
    var selector = (settings.customCartIconSelector && settings.customCartIconSelector.trim())
      || THEME_MAP[themeName]
      || null;

    var original = selector ? document.querySelector(selector) : null;

    /* Broad fallback chain if nothing matched yet */
    if (!original) {
      var fallbacks = [
        ".header-actions__cart-icon",
        "#cart-icon-bubble",
        ".header__cart",
        ".cart-link",
        ".site-header__cart",
        "[data-cart-toggle]",
      ];
      for (var fi = 0; fi < fallbacks.length; fi++) {
        original = document.querySelector(fallbacks[fi]);
        if (original && !original.closest("#ec-cart")) break;
        original = null;
      }
    }

    if (!original || original.id === "ec-cart-trigger") return;

    /* Walk UP to the real clickable ancestor (button or link) that the theme
       attaches its click handler to. This is the element we must hide — hiding
       only the inner icon leaves the outer button active and also causes our
       injected button to be nested inside the theme's button (invalid HTML). */
    var hideTarget = original.closest("button, a[href]") || original;

    /* Safety: never hide something that is (or contains) our own drawer */
    if (hideTarget.closest("#ec-cart")) return;

    /* Build our button */
    var btn = document.createElement("button");
    btn.id        = "ec-cart-trigger";
    btn.className = "ec-cart-trigger";
    btn.setAttribute("type", "button");
    btn.setAttribute("aria-label", "Open cart");
    btn.innerHTML = svgCartBag() + '<span class="ec-cart-trigger__badge" id="ec-trigger-badge"></span>';

    btn.addEventListener("click", function () {
      loadCart().then(function (c) { cart = c; render(); openCart(); syncFreebie(); });
    });

    function applyHide() {
      hideTarget.style.setProperty("display", "none", "important");
    }

    function ensureButton() {
      if (!document.getElementById("ec-cart-trigger")) {
        if (hideTarget.parentNode) {
          hideTarget.parentNode.insertBefore(btn, hideTarget.nextSibling);
        }
      }
    }

    applyHide();

    /* Insert as SIBLING of the hidden target — not inside it */
    hideTarget.parentNode.insertBefore(btn, hideTarget.nextSibling);

    /* Watch for the theme's JS resetting display or removing our button.
       Themes often re-init their header after page load, wiping inline styles. */
    var obs = new MutationObserver(function () {
      /* Re-apply hide if theme cleared our inline display:none */
      if (hideTarget.style.display !== "none") applyHide();
      /* Re-insert our button if theme rebuilt the DOM and removed it */
      ensureButton();
    });

    /* Observe style/class changes on the hidden element */
    obs.observe(hideTarget, { attributes: true, attributeFilter: ["style", "class"] });

    /* Observe the parent container for child list mutations (node removed/re-added) */
    var parent = hideTarget.parentNode;
    if (parent) obs.observe(parent, { childList: true });

    /* Sync badge immediately if cart is already loaded */
    syncCartBadges();
  }

  /* ===========================================================
     THEME NATIVE CART SUPPRESSION
     Disables the built-in cart drawer in Dawn, Horizon, Tinker,
     Craft, Crave, etc. so EdgeCart is the only cart experience.
  =========================================================== */
  function suppressThemeCart() {
    /* Only intercept custom events that themes dispatch programmatically
       (e.g. after add-to-cart via fetch). We no longer hide the drawer
       element itself — that caused flicker because the theme's own JS
       overrides inline styles. The trigger button is already hidden by
       replaceThemeCartIcon(), so the drawer can never open via click. */
    var CART_OPEN_EVENTS = [
      "cart:open", "cart:show", "cart:toggle",
      "dispatch:cart-drawer:open", "cartdrawer:open",
      "cart-drawer:open", "CartDrawer:open",
      "theme:cart:open", "cart-open",
    ];
    CART_OPEN_EVENTS.forEach(function (evName) {
      [window, document].forEach(function (target) {
        target.addEventListener(evName, function (e) {
          e.stopImmediatePropagation();
          openCart();
        }, true);
      });
    });
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
          lastNativeAddAt = Date.now(); /* theme added — used to dedupe a duplicate form-submit add */
          promise.then(function (res) {
            if (res && res.ok) {
              var cloned = res.clone();
              setTimeout(function () {
                cloned.json().then(function (item) { handlePostAdd(item); }).catch(function () { handlePostAdd(null); });
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
        lastNativeAddAt = Date.now(); /* theme added — used to dedupe a duplicate form-submit add */
        var xhr = this;
        xhr.addEventListener("load", function () {
          if (xhr.status >= 200 && xhr.status < 300) {
            var item = null;
            try { item = JSON.parse(xhr.responseText); } catch (_) {}
            setTimeout(function () { handlePostAdd(item); }, 50);
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

      /* Some themes' add-to-cart button fires its OWN AJAX /cart/add AND lets the
         form submit — which would add the item twice. If we just observed a native
         add (within ~1.2s), the theme already added it; just open/refresh the cart
         instead of adding again. */
      if (Date.now() - lastNativeAddAt < 1200) {
        handlePostAdd(null);
        return;
      }

      setSubmitBtnLoading(form, true);
      cartAdd(vid, qty, {})
        .then(function (item) { handlePostAdd(item, true); })
        .catch(function () { form.submit(); })
        .finally(function () { setSubmitBtnLoading(form, false); });
    }, true);

    /* Cart icon / /cart link clicks — capture phase so we run BEFORE theme handlers */
    var CART_ICON_SEL = [
      /* Universal */
      'a[href="/cart"]', 'a[href^="/cart?"]',
      /* Attribute-based (Dawn, Horizon, Craft) */
      '[data-cart-toggle]', '[data-action="toggle-cart"]',
      '[data-open="cart-drawer"]', '[aria-controls="CartDrawer"]',
      '[aria-controls="cart-drawer"]', '[aria-controls="cart-notification"]',
      /* Class-based (various themes) */
      '.cart-link', '.cart-toggle', '.header__cart', '.cart-icon-bubble',
      '.cart-count-bubble', '.header-cart', '.nav__icon--cart',
      '.js-cart-open', '.js-mini-cart-toggle', '.site-cart__btn',
      /* Custom element / ID based */
      'cart-icon-bubble', '#cart-icon-bubble',
      /* Tinker-specific */
      '[data-cart]', '.icon-cart',
    ].join(", ");

    document.addEventListener("click", function (e) {
      if (e.target.closest("#ec-cart")) return;
      var link = e.target.closest(CART_ICON_SEL);
      if (!link) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      openCart();
    }, true); /* capture:true — fires before any theme bubble listener */

    /* Escape key */
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isOpen) closeCart();
    });

    /* Theme cart events */
    document.addEventListener("cart:updated", function () {
      loadCart().then(function (c) { cart = c; if (isOpen) render(); syncFreebie(); });
    });
    document.addEventListener("theme:cart:add", function () {
      handlePostAdd(null, false);
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
        .then(function () {
          track("upsell_add", { variantId: vid, revenue: cart ? cart.total_price : 0 });
          render(); syncFreebie();
        })
        .catch(function (err) {
          upsellBtn.disabled = false;
          upsellBtn.textContent = "+ Add";
          upsellBtn.classList.remove("ec-upsell-card__add--done");
          var msg = err && err.message ? err.message : "Could not add item. Please try again.";
          showToast(msg, 4000, false);
        });
      return;
    }

    var discRemoveBtn = e.target.closest("[data-action='discount-remove']");
    if (discRemoveBtn) { clearDiscount(); return; }

    var upsellScroll = e.target.closest("[data-action='upsell-scroll']");
    if (upsellScroll) {
      var scroller = upsellScroll.closest(".ec-upsell-scroller");
      var trackEl = scroller && scroller.querySelector(".ec-upsell-track");
      if (trackEl) trackEl.scrollBy({ left: (parseInt(upsellScroll.dataset.dir, 10) || 1) * Math.round(trackEl.clientWidth * 0.8), behavior: "smooth" });
      return;
    }

    var couponToggle = e.target.closest("[data-action='toggle-coupons']");
    if (couponToggle) { couponsOpen = !couponsOpen; renderFooter(); return; }

    var couponApply = e.target.closest("[data-action='apply-coupon']");
    if (couponApply) {
      var cpnCode = couponApply.dataset.code;
      if (cpnCode) { couponsOpen = false; applyDiscount(cpnCode); }
      return;
    }

  }

  /* True if the currently-applied code is still valid for the cart as it stands.
     After a cart change (e.g. removing the one product a code applied to), Shopify
     keeps the code in discount_codes but flips applicable:false — we use that to
     auto-remove a code that no longer applies. */
  function discountStillApplicable() {
    if (!discountCode) return true;
    var codes = (cart && cart.discount_codes) || [];
    for (var i = 0; i < codes.length; i++) {
      if ((codes[i].code || "").toUpperCase() === discountCode && codes[i].applicable) return true;
    }
    return false;
  }

  function doCartChange(key, qty) {
    updatingKeys[key] = true;
    renderBody();
    cartChange(key, qty) /* key-based: targets the exact line, so qty/remove never hits a neighbouring line (e.g. X vs Y in Buy X Get Y) */
      .then(function () {
        delete updatingKeys[key];
        aiSeedProductId = null; /* invalidate AI cache — cart composition changed */
        /* If the cart change made an applied code invalid (e.g. its eligible
           product was removed), auto-remove the code so it doesn't linger. */
        if (discountCode && !discountStillApplicable()) {
          var removed = discountCode;
          clearDiscount();
          showToast('Discount "' + removed + '" removed — no longer applies to your cart', 4000, false);
        }
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
    /* Update theme's own badge elements */
    document.querySelectorAll(
      "[data-cart-count], .cart-count, #CartCount, .cart-item-count, .header__cart-bubble, .cart-bubble"
    ).forEach(function (el) {
      el.textContent   = count;
      el.style.display = count > 0 ? "" : "none";
    });
    /* Update our injected trigger badge */
    var badge = id("ec-trigger-badge");
    if (badge) {
      badge.textContent = count > 0 ? (count > 99 ? "99+" : String(count)) : "";
      if (count > 0) badge.classList.add("ec-cart-trigger__badge--show");
      else            badge.classList.remove("ec-cart-trigger__badge--show");
    }
  }

  function checkoutUrl() {
    return discountCode
      ? "/checkout?discount=" + encodeURIComponent(discountCode)
      : "/checkout";
  }

  function money(cents) { return moneyVal(cents); }

  /* Formats a dollar-string from Shopify's REST API (e.g. "749.95") directly.
     Avoids the * 100 / 100 round-trip that can introduce floating-point drift. */
  /* Resolve store currency — cart.currency is most reliable (from Shopify AJAX API).
     Falls back to window.Shopify.currency.active, then app settings, then USD. */
  function storeCurrency() {
    return (cart && cart.currency) ||
      (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) ||
      (settings && settings.currencyCode) || "USD";
  }

  /* Resolve locale — window.Shopify.locale is set by Shopify to e.g. "en-IN".
     Falls back to app settings, then en-US. */
  function storeLocale() {
    return (window.Shopify && window.Shopify.locale) ||
      (settings && settings.locale) || "en-US";
  }

  function moneyDollars(str) {
    var val = parseFloat(str) || 0;
    try {
      return new Intl.NumberFormat(storeLocale(), {
        style: "currency", currency: storeCurrency(), minimumFractionDigits: 2,
      }).format(val);
    } catch (_) {
      return (settings && settings.currencySymbol || "$") + val.toFixed(2);
    }
  }

  function moneyVal(cents) {
    try {
      return new Intl.NumberFormat(storeLocale(), {
        style: "currency", currency: storeCurrency(), minimumFractionDigits: 2,
      }).format(cents / 100);
    } catch (_) {
      return (settings && settings.currencySymbol || "$") + (cents / 100).toFixed(2);
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
  function qsa(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function make(tag, cls) { var el = document.createElement(tag); if (cls) el.className = cls; return el; }
  function on(el, evt, fn) { if (el) el.addEventListener(evt, fn); }

  /* ── SVG icons ─────────────────────────────────────────── */
  function svgClose() {
    return '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M15 5L5 15M5 5l10 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  function svgCartBag() {
    return [
      '<svg class="ec-cart-trigger__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"',
        ' fill="none" stroke="currentColor" stroke-width="1.75"',
        ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
        '<path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>',
        '<line x1="3" y1="6" x2="21" y2="6"/>',
        '<path d="M16 10a4 4 0 01-8 0"/>',
      '</svg>',
    ].join("");
  }

  function svgX() {
    return '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M11 3L3 11M3 3l8 8" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>';
  }
  function svgTrash() {
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v14a1 1 0 01-1 1H7a1 1 0 01-1-1V6h12z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 11v6M14 11v6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
  }
  function svgChevron() {
    return '<svg class="ec-os__chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>';
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
