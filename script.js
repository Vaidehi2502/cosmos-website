/* =========================================================================
   COSMOS — unified client script (Vanilla ES6+, zero dependency)
   Runs on every page; each feature guards on the elements it needs.
   ========================================================================= */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ----------------------------------------------------------------------
     1) MILKY WAY CANVAS — a warm nebula band + dense stars + parallax
        (replaces the earlier blue/violet drifting dust). The nebula glow is
        baked once to an offscreen canvas and blitted each frame; only the
        stars twinkle, so it stays cheap on every page.
     ---------------------------------------------------------------------- */
  (function milkyWay() {
    var canvas = document.getElementById("starfield");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    if (!ctx) return;

    var stars = [];
    var w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    var pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    var neb = document.createElement("canvas");
    var nctx = neb.getContext("2d");
    var ANGLE = -0.42; // tilt of the galactic band (radians)

    function band() {
      return {
        cx: w * 0.5, cy: h * 0.55,
        dir: { x: Math.cos(ANGLE), y: Math.sin(ANGLE) },
        nrm: { x: Math.sin(ANGLE), y: -Math.cos(ANGLE) },
        half: Math.hypot(w, h) * 0.62
      };
    }

    function resize() {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      neb.width = canvas.width;
      neb.height = canvas.height;
      nctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
    }

    function bakeNebula(b) {
      nctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      nctx.clearRect(0, 0, w, h);
      nctx.globalCompositeOperation = "lighter";
      var clouds = Math.round(Math.hypot(w, h) / 10);
      for (var i = 0; i < clouds; i++) {
        var t = (i / clouds - 0.5) * 2;                 // -1..1 along the band
        var along = t * b.half;
        var off = (Math.random() - 0.5) * h * (0.16 + Math.random() * 0.2);
        var x = b.cx + b.dir.x * along + b.nrm.x * off;
        var y = b.cy + b.dir.y * along + b.nrm.y * off;
        var coreNear = 1 - Math.min(1, Math.abs(t) / 0.75);
        var rad = (46 + Math.random() * 150) * (0.55 + coreNear);
        var a = (0.012 + Math.random() * 0.028) * (0.35 + coreNear);
        var col = coreNear > 0.6
          ? "246, 240, 228"
          : (Math.random() > 0.5 ? "232, 206, 160" : "206, 150, 92");
        var g = nctx.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, "rgba(" + col + ", " + a.toFixed(3) + ")");
        g.addColorStop(1, "rgba(" + col + ", 0)");
        nctx.fillStyle = g;
        nctx.beginPath();
        nctx.arc(x, y, rad, 0, Math.PI * 2);
        nctx.fill();
      }
      // Bright galactic core bulge.
      var cg = nctx.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, h * 0.36);
      cg.addColorStop(0, "rgba(255, 248, 232, 0.10)");
      cg.addColorStop(1, "rgba(255, 248, 232, 0)");
      nctx.fillStyle = cg;
      nctx.beginPath();
      nctx.arc(b.cx, b.cy, h * 0.36, 0, Math.PI * 2);
      nctx.fill();
      nctx.globalCompositeOperation = "source-over";
    }

    function build() {
      var b = band();
      bakeNebula(b);

      stars = [];
      var count = Math.round((w * h) / 1700);
      for (var i = 0; i < count; i++) {
        var inBand = Math.random() < 0.62;
        var x, y;
        if (inBand) {
          var along = (Math.random() - 0.5) * 2 * b.half;
          var gg = (Math.random() + Math.random() + Math.random() - 1.5); // ~gaussian
          var off = gg * h * 0.13;
          x = b.cx + b.dir.x * along + b.nrm.x * off;
          y = b.cy + b.dir.y * along + b.nrm.y * off;
        } else {
          x = Math.random() * w;
          y = Math.random() * h;
        }
        var roll = Math.random();
        var color = roll < 0.72 ? "248, 250, 252"
          : roll < 0.86 ? "255, 228, 182"
            : roll < 0.95 ? "255, 198, 146"
              : "192, 214, 255";
        stars.push({
          x: x, y: y,
          r: Math.random() * 1.15 + 0.25 + (inBand ? 0.15 : 0),
          depth: Math.random() * 0.8 + 0.2,
          tw: Math.random() * Math.PI * 2,
          tws: Math.random() * 0.02 + 0.004,
          base: inBand ? 0.62 : 0.5,
          color: color
        });
      }
    }

    function draw() {
      pointer.x += (pointer.tx - pointer.x) * 0.06;
      pointer.y += (pointer.ty - pointer.y) * 0.06;
      ctx.clearRect(0, 0, w, h);

      // Nebula band with a little parallax drift (drawn slightly oversized so
      // the parallax offset never reveals a hard edge).
      var ox = pointer.x * 9, oy = pointer.y * 9;
      ctx.drawImage(neb, ox - 12, oy - 12, w + 24, h + 24);

      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        s.tw += s.tws;
        var alpha = s.base + Math.sin(s.tw) * 0.35;
        if (alpha < 0) alpha = 0;
        var px = s.x + pointer.x * s.depth * 14;
        var py = s.y + pointer.y * s.depth * 14;
        ctx.beginPath();
        ctx.arc(px, py, s.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(" + s.color + ", " + alpha.toFixed(3) + ")";
        ctx.fill();
      }

      if (!reduceMotion) requestAnimationFrame(draw);
    }

    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener("mousemove", function (e) {
      pointer.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      pointer.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });

    resize();
    if (reduceMotion) {
      draw(); // render a single static frame
    } else {
      requestAnimationFrame(draw);
    }
  })();

  /* ----------------------------------------------------------------------
     2) 3D TILT on celestial cards
     ---------------------------------------------------------------------- */
  (function tilt() {
    if (reduceMotion) return;
    var cards = document.querySelectorAll("[data-tilt]");
    if (!cards.length) return;
    Array.prototype.forEach.call(cards, function (card) {
      card.addEventListener("mousemove", function (e) {
        var rect = card.getBoundingClientRect();
        var cx = (e.clientX - rect.left) / rect.width - 0.5;
        var cy = (e.clientY - rect.top) / rect.height - 0.5;
        card.style.transform =
          "rotateY(" + (cx * 10).toFixed(2) + "deg) rotateX(" +
          (-cy * 10).toFixed(2) + "deg) translateY(-4px)";
      });
      card.addEventListener("mouseleave", function () {
        card.style.transform = "";
      });
    });
  })();

  /* ----------------------------------------------------------------------
     3) NASA APOD — live fetch with graceful local fallback
     ---------------------------------------------------------------------- */
  (function apod() {
    var img = document.getElementById("apod-image");
    if (!img) return;
    var titleEl = document.getElementById("apod-title");
    var dateEl = document.getElementById("apod-date");
    var explEl = document.getElementById("apod-explanation");
    // The initial markup src is the curated placeholder (a build tool may inline
    // or hash it, so read it from the element rather than hard-coding the path).
    var placeholderSrc = img.getAttribute("src") || img.src;

    var fallback = {
      title: "Our home galaxy, the Milky Way",
      date: "Featured highlight",
      explanation: "The Milky Way is a barred spiral galaxy about 100,000 light-years across, home to between 100 and 400 billion stars. Our Solar System sits roughly 26,000 light-years from the galactic centre and completes one orbit every 230 million years. (Live NASA image unavailable right now — showing a curated highlight.)"
    };

    function applyFallback() {
      titleEl.textContent = fallback.title;
      dateEl.textContent = fallback.date;
      explEl.textContent = fallback.explanation;
      img.src = placeholderSrc;
      img.alt = "Illustration of the Milky Way galaxy shown as a curated COSMOS highlight";
    }

    if (!window.fetch) { applyFallback(); return; }

    var url = "https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY";
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = setTimeout(function () { if (controller) controller.abort(); }, 7000);

    fetch(url, controller ? { signal: controller.signal } : undefined)
      .then(function (res) {
        if (!res.ok) throw new Error("APOD request failed: " + res.status);
        return res.json();
      })
      .then(function (data) {
        clearTimeout(timer);
        if (!data || (data.media_type && data.media_type !== "image") || !data.url) {
          applyFallback();
          return;
        }
        titleEl.textContent = data.title || fallback.title;
        dateEl.textContent = data.date || "Today";
        explEl.textContent = data.explanation || fallback.explanation;
        img.src = data.url;
        img.alt = "NASA Astronomy Picture of the Day: " + (data.title || "a view of deep space");
      })
      .catch(function () {
        clearTimeout(timer);
        applyFallback();
      });
  })();

  /* ----------------------------------------------------------------------
     4) COSMIC LIBRARY — data, render, search, filter, dialog
     ---------------------------------------------------------------------- */
  (function library() {
    var grid = document.getElementById("lesson-grid");
    if (!grid) return;

    var searchInput = document.getElementById("lesson-search");
    var chips = document.querySelectorAll(".chip");
    var noResults = document.getElementById("no-results");
    var dialog = document.getElementById("lesson-dialog");
    var dialogTitle = document.getElementById("dialog-title");
    var dialogBody = document.getElementById("dialog-body");
    var dialogDiff = document.getElementById("dialog-diff");
    var dialogCitation = document.getElementById("dialog-citation");
    var dialogRelated = document.getElementById("dialog-related");
    var dialogClose = document.getElementById("dialog-close");
    var lastFocused = null;

    var lessons = [
      {
        id: "big-bang", cat: "origins", diff: "Beginner", level: "diff-beginner",
        title: "The Big Bang and cosmic dawn",
        teaser: "How the universe expanded from a hot, dense point 13.8 billion years ago.",
        body: "About 13.8 billion years ago the observable universe began expanding from an extremely hot, dense state. Within the first three minutes, protons and neutrons formed the lightest nuclei. After roughly 380,000 years the universe cooled enough for atoms to form, releasing the cosmic microwave background — the oldest light we can still detect today.",
        related: "Related: Stellar nucleosynthesis, Cosmic microwave background.",
        cite: "Source: NASA / WMAP cosmology overview."
      },
      {
        id: "star-life", cat: "origins", diff: "Intermediate", level: "diff-intermediate",
        title: "The life cycle of a star",
        teaser: "From collapsing nebulae to white dwarfs, neutron stars, and black holes.",
        body: "Stars are born inside cold molecular clouds where gravity pulls gas into a protostar. When the core becomes hot enough, hydrogen fusion ignites and the star joins the main sequence. Low-mass stars like the Sun end as white dwarfs; massive stars explode as supernovae, leaving behind neutron stars or black holes.",
        related: "Related: The Sun, Neutron stars, Supernova remnants.",
        cite: "Source: NASA stellar evolution resources."
      },
      {
        id: "nebula", cat: "origins", diff: "Beginner", level: "diff-beginner",
        title: "Nebulae: the nurseries of stars",
        teaser: "Vast clouds of gas and dust where new stars and planets take shape.",
        body: "A nebula is an interstellar cloud of hydrogen, helium, and dust. Emission nebulae glow as nearby hot stars ionise their gas, while dark nebulae block the light behind them. The Pillars of Creation in the Eagle Nebula are a famous example of active star formation captured by the Hubble and James Webb telescopes.",
        related: "Related: The life cycle of a star, The Big Bang.",
        cite: "Source: ESA / Hubble & NASA imagery notes."
      },
      {
        id: "solar-system", cat: "solar", diff: "Beginner", level: "diff-beginner",
        title: "Anatomy of the Solar System",
        teaser: "Eight planets, dwarf planets, moons, asteroids, and comets around one star.",
        body: "The Solar System formed 4.6 billion years ago from a rotating disk of gas and dust. Four small rocky worlds orbit close to the Sun, followed by two gas giants and two ice giants. Beyond Neptune lies the Kuiper Belt of icy bodies, and far further out the hypothesised Oort Cloud of comets.",
        related: "Related: Earth, Saturn, Comparative planetary scale (Lab).",
        cite: "Source: NASA Solar System exploration."
      },
      {
        id: "saturn-rings", cat: "solar", diff: "Intermediate", level: "diff-intermediate",
        title: "Saturn's rings and moons",
        teaser: "Why the ringed giant is the jewel of the Solar System.",
        body: "Saturn's rings span up to 280,000 kilometres yet are often only about 10 metres thick. They are made mostly of water ice with traces of rocky material. Among Saturn's 140-plus moons, Titan has a thick nitrogen atmosphere and liquid methane lakes, while Enceladus vents water geysers from a subsurface ocean.",
        related: "Related: Anatomy of the Solar System, Interplanetary weight (Wonders).",
        cite: "Source: NASA Cassini mission findings."
      },
      {
        id: "goldilocks", cat: "solar", diff: "Intermediate", level: "diff-intermediate",
        title: "The habitable zone",
        teaser: "The orbital sweet spot where liquid water can exist on a planet.",
        body: "The habitable or 'Goldilocks' zone is the range of distances from a star where temperatures allow liquid water on a planet's surface. Earth sits comfortably inside the Sun's habitable zone. Finding Earth-sized worlds in the habitable zones of other stars is a central goal of missions such as Kepler and TESS.",
        related: "Related: Earth, Anatomy of the Solar System.",
        cite: "Source: NASA Exoplanet Exploration program."
      },
      {
        id: "black-holes", cat: "extreme", diff: "Advanced", level: "diff-advanced",
        title: "Black holes and event horizons",
        teaser: "Regions where gravity is so strong that not even light escapes.",
        body: "A black hole forms when matter collapses to a point of extreme density. Its event horizon is the boundary beyond which nothing, not even light, can escape. In 2019 the Event Horizon Telescope captured the first image of a black hole's shadow in galaxy M87, confirming predictions of Einstein's general relativity.",
        related: "Related: The life cycle of a star, Neutron stars (Wonders).",
        cite: "Source: Event Horizon Telescope / NASA relativity notes."
      },
      {
        id: "relativity", cat: "extreme", diff: "Advanced", level: "diff-advanced",
        title: "Spacetime and general relativity",
        teaser: "How mass bends the fabric of space and warps the flow of time.",
        body: "Einstein's general relativity describes gravity not as a force but as the curvature of spacetime caused by mass and energy. Massive objects slow the passage of time nearby, an effect measured in GPS satellites. Light bends as it passes massive galaxies, producing gravitational lensing that astronomers use as natural telescopes.",
        related: "Related: Black holes, The habitable zone.",
        cite: "Source: NASA general relativity educational material."
      },
      {
        id: "dark-matter", cat: "extreme", diff: "Advanced", level: "diff-advanced",
        title: "Dark matter and dark energy",
        teaser: "The invisible 95% of the universe we can measure but not yet see.",
        body: "Ordinary matter makes up only about 5% of the universe. Roughly 27% is dark matter, which we detect through its gravitational pull on galaxies, and about 68% is dark energy, a mysterious pressure driving the universe's accelerating expansion. Their true nature remains one of physics' greatest open questions.",
        related: "Related: The Big Bang, Spacetime and general relativity.",
        cite: "Source: ESA Planck mission & NASA cosmology data."
      }
    ];

    var activeFilter = "all";

    function render() {
      var query = (searchInput.value || "").trim().toLowerCase();
      grid.innerHTML = "";
      var shown = 0;

      lessons.forEach(function (lesson) {
        var matchesFilter = activeFilter === "all" || lesson.cat === activeFilter;
        var haystack = (lesson.title + " " + lesson.teaser + " " + lesson.body).toLowerCase();
        var matchesQuery = !query || haystack.indexOf(query) !== -1;
        if (!matchesFilter || !matchesQuery) return;

        shown++;
        var card = document.createElement("article");
        card.className = "panel lesson";
        card.setAttribute("tabindex", "0");
        card.setAttribute("role", "button");
        card.setAttribute("aria-haspopup", "dialog");
        card.setAttribute("aria-label", "Open lesson: " + lesson.title);

        var badge = document.createElement("span");
        badge.className = "diff " + lesson.level;
        badge.textContent = lesson.diff;

        var h = document.createElement("h3");
        h.textContent = lesson.title;

        var p = document.createElement("p");
        p.textContent = lesson.teaser;

        card.appendChild(badge);
        card.appendChild(h);
        card.appendChild(p);

        function open() { openDialog(lesson, card); }
        card.addEventListener("click", open);
        card.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
        });

        grid.appendChild(card);
      });

      noResults.hidden = shown !== 0;
    }

    function openDialog(lesson, trigger) {
      lastFocused = trigger || document.activeElement;
      dialogTitle.textContent = lesson.title;
      dialogBody.textContent = lesson.body;
      dialogDiff.textContent = lesson.diff;
      dialogDiff.className = "diff " + lesson.level;
      dialogRelated.textContent = lesson.related;
      dialogCitation.textContent = lesson.cite;
      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
      }
      dialogClose.focus();
    }

    function closeDialog() {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
      if (lastFocused && lastFocused.focus) lastFocused.focus();
    }

    dialogClose.addEventListener("click", closeDialog);
    dialog.addEventListener("cancel", function (e) { e.preventDefault(); closeDialog(); });
    dialog.addEventListener("click", function (e) {
      // click on the backdrop (outside the dialog content) closes it
      var rect = dialog.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right ||
          e.clientY < rect.top || e.clientY > rect.bottom) {
        closeDialog();
      }
    });

    searchInput.addEventListener("input", render);
    Array.prototype.forEach.call(chips, function (chip) {
      chip.addEventListener("click", function () {
        activeFilter = chip.getAttribute("data-filter");
        Array.prototype.forEach.call(chips, function (c) {
          c.setAttribute("aria-pressed", c === chip ? "true" : "false");
        });
        render();
      });
    });

    // Deep-link support (additive): ?cat=solar&q=saturn — used by the 3D hero's
    // "Explore related lessons" links. Falls back silently if unsupported.
    (function applyQuery() {
      try {
        var params = new URLSearchParams(window.location.search);
        var q = params.get("q");
        var cat = params.get("cat");
        if (q) searchInput.value = q;
        if (cat) {
          var match = null;
          Array.prototype.forEach.call(chips, function (c) {
            var isMatch = c.getAttribute("data-filter") === cat;
            if (isMatch) match = c;
            c.setAttribute("aria-pressed", isMatch ? "true" : "false");
          });
          if (match) activeFilter = cat;
        }
      } catch (e) { /* no-op */ }
    })();

    render();
  })();

  /* ----------------------------------------------------------------------
     Shared planetary dataset (Lab + Wonders)
     ---------------------------------------------------------------------- */
  var PLANETS = [
    { name: "Mercury", diameter: 4879,   gravity: 3.70,  day: 4222.6, moons: 0 },
    { name: "Venus",   diameter: 12104,  gravity: 8.87,  day: 2802.0, moons: 0 },
    { name: "Earth",   diameter: 12756,  gravity: 9.81,  day: 24.0,   moons: 1 },
    { name: "Mars",    diameter: 6792,   gravity: 3.71,  day: 24.7,   moons: 2 },
    { name: "Jupiter", diameter: 142984, gravity: 24.79, day: 9.9,    moons: 95 },
    { name: "Saturn",  diameter: 120536, gravity: 10.44, day: 10.7,   moons: 146 },
    { name: "Uranus",  diameter: 51118,  gravity: 8.87,  day: 17.2,   moons: 28 },
    { name: "Neptune", diameter: 49528,  gravity: 11.15, day: 16.1,   moons: 16 }
  ];

  function findPlanet(name) {
    for (var i = 0; i < PLANETS.length; i++) {
      if (PLANETS[i].name === name) return PLANETS[i];
    }
    return PLANETS[0];
  }

  /* ----------------------------------------------------------------------
     5a) LAB — Newtonian gravity simulator
     ---------------------------------------------------------------------- */
  (function gravity() {
    var m1 = document.getElementById("mass1");
    if (!m1) return;
    var m2 = document.getElementById("mass2");
    var dist = document.getElementById("distance");
    var m1Out = document.getElementById("mass1-out");
    var m2Out = document.getElementById("mass2-out");
    var distOut = document.getElementById("distance-out");
    var forceOut = document.getElementById("force-out");
    var G = 6.674e-11;

    function format(n) {
      if (n === 0) return "0 N";
      var exp = Math.floor(Math.log10(Math.abs(n)));
      var mant = n / Math.pow(10, exp);
      return mant.toFixed(2) + " × 10" + toSuper(exp) + " N";
    }
    function toSuper(num) {
      var map = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²",
        "3": "³", "4": "⁴", "5": "⁵", "6": "⁶",
        "7": "⁷", "8": "⁸", "9": "⁹" };
      return String(num).split("").map(function (c) { return map[c] || c; }).join("");
    }

    function compute() {
      var mass1 = parseFloat(m1.value) * 1e24; // kg
      var mass2 = parseFloat(m2.value) * 1e22; // kg
      var r = parseFloat(dist.value) * 1e9;    // metres (10^6 km = 10^9 m)
      m1Out.textContent = parseFloat(m1.value).toFixed(2);
      m2Out.textContent = parseFloat(m2.value).toFixed(2);
      distOut.textContent = parseFloat(dist.value).toFixed(3);
      var force = (G * mass1 * mass2) / (r * r);
      forceOut.textContent = format(force);
    }

    [m1, m2, dist].forEach(function (el) {
      el.addEventListener("input", compute);
    });
    compute();
  })();

  /* ----------------------------------------------------------------------
     5b) LAB — comparative planetary scale table
     ---------------------------------------------------------------------- */
  (function scale() {
    var selA = document.getElementById("planet-a");
    if (!selA) return;
    var selB = document.getElementById("planet-b");
    var body = document.getElementById("scale-body");
    var colA = document.getElementById("col-a");
    var colB = document.getElementById("col-b");

    PLANETS.forEach(function (p) {
      var oa = document.createElement("option");
      oa.value = p.name; oa.textContent = p.name;
      selA.appendChild(oa);
      var ob = document.createElement("option");
      ob.value = p.name; ob.textContent = p.name;
      selB.appendChild(ob);
    });
    selA.value = "Earth";
    selB.value = "Jupiter";

    function fmt(n) { return n.toLocaleString("en-US"); }

    function rows(p) {
      return [
        ["Equatorial diameter", fmt(p.diameter) + " km"],
        ["Surface gravity", p.gravity.toFixed(2) + " m/s²"],
        ["Length of one day", (p.day >= 100 ? fmt(Math.round(p.day)) : p.day) + " hours"],
        ["Confirmed moons", fmt(p.moons)]
      ];
    }

    function render() {
      var a = findPlanet(selA.value);
      var b = findPlanet(selB.value);
      colA.textContent = a.name;
      colB.textContent = b.name;
      var ra = rows(a), rb = rows(b);
      body.innerHTML = "";
      for (var i = 0; i < ra.length; i++) {
        var tr = document.createElement("tr");
        var th = document.createElement("th");
        th.setAttribute("scope", "row");
        th.textContent = ra[i][0];
        var td1 = document.createElement("td");
        td1.textContent = ra[i][1];
        var td2 = document.createElement("td");
        td2.textContent = rb[i][1];
        tr.appendChild(th); tr.appendChild(td1); tr.appendChild(td2);
        body.appendChild(tr);
      }
    }

    selA.addEventListener("change", render);
    selB.addEventListener("change", render);
    render();
  })();

  /* ----------------------------------------------------------------------
     6a) WONDERS — interplanetary weight calculator
     ---------------------------------------------------------------------- */
  (function weight() {
    var input = document.getElementById("earth-weight");
    if (!input) return;
    var grid = document.getElementById("weight-grid");
    var earthG = 9.81;

    var worlds = [
      { name: "Mercury", gravity: 3.70, note: "Smallest planet, scorching days and freezing nights." },
      { name: "The Moon", gravity: 1.62, note: "Earth's only natural satellite — the Apollo bounce." },
      { name: "Mars", gravity: 3.71, note: "The red planet and target for future human missions." },
      { name: "Jupiter", gravity: 24.79, note: "Gas giant with the strongest gravity of any planet." }
    ];

    function render() {
      var kg = parseFloat(input.value);
      grid.innerHTML = "";
      worlds.forEach(function (world) {
        var card = document.createElement("article");
        card.className = "panel weight-card";
        var h = document.createElement("h3");
        h.textContent = world.name;
        var v = document.createElement("p");
        v.className = "value";
        if (isNaN(kg) || kg <= 0) {
          v.textContent = "—";
        } else {
          var val = kg * (world.gravity / earthG);
          v.textContent = val.toFixed(1) + " kg";
        }
        var note = document.createElement("p");
        note.className = "body";
        note.textContent = world.note;
        card.appendChild(h); card.appendChild(v); card.appendChild(note);
        grid.appendChild(card);
      });
    }

    input.addEventListener("input", render);
    render();
  })();

  /* ----------------------------------------------------------------------
     6b) WONDERS — fact or fiction quiz
     ---------------------------------------------------------------------- */
  (function quiz() {
    var questionEl = document.getElementById("quiz-question");
    if (!questionEl) return;
    var optionsEl = document.getElementById("quiz-options");
    var feedbackEl = document.getElementById("quiz-feedback");
    var scoreEl = document.getElementById("quiz-score");
    var nextBtn = document.getElementById("quiz-next");

    var items = [
      {
        statement: "A day on Venus is longer than its year.",
        fact: true,
        explain: "True. Venus rotates so slowly that one Venusian day (243 Earth days) outlasts its 225-Earth-day orbit around the Sun."
      },
      {
        statement: "You could hear a star explode if you were nearby in space.",
        fact: false,
        explain: "Fiction. Sound needs a medium to travel through, and the near-vacuum of space carries no sound waves to your ears."
      },
      {
        statement: "There are more stars in the universe than grains of sand on Earth.",
        fact: true,
        explain: "True. Estimates put the universe's stars in the sextillions, far exceeding the roughly 7.5 quintillion grains of sand on Earth."
      },
      {
        statement: "The Sun is a perfectly solid ball of burning fire.",
        fact: false,
        explain: "Fiction. The Sun is a sphere of superheated plasma powered by nuclear fusion, not ordinary fire or a solid surface."
      },
      {
        statement: "Neutron star material is so dense a sugar-cube-sized piece would weigh billions of tonnes.",
        fact: true,
        explain: "True. Neutron stars cram more than the Sun's mass into a city-sized sphere, giving matter almost unimaginable density."
      }
    ];

    var index = 0, score = 0, answered = 0, locked = false;

    function updateScore() {
      scoreEl.textContent = "Score: " + score + " correct of " + answered + " answered.";
    }

    function render() {
      locked = false;
      feedbackEl.textContent = "";
      feedbackEl.className = "quiz-feedback";
      optionsEl.innerHTML = "";
      var item = items[index];
      questionEl.textContent = item.statement;

      [["Fact", true], ["Fiction", false]].forEach(function (opt) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "quiz-option";
        btn.textContent = opt[0];
        btn.addEventListener("click", function () { answer(opt[1], btn, item); });
        optionsEl.appendChild(btn);
      });
    }

    function answer(choice, btn, item) {
      if (locked) return;
      locked = true;
      answered++;
      var correct = choice === item.fact;
      if (correct) {
        score++;
        btn.classList.add("correct");
        feedbackEl.textContent = "Correct! " + item.explain;
        feedbackEl.className = "quiz-feedback good";
      } else {
        btn.classList.add("wrong");
        feedbackEl.textContent = "Not quite. " + item.explain;
        feedbackEl.className = "quiz-feedback bad";
      }
      updateScore();
    }

    nextBtn.addEventListener("click", function () {
      index = (index + 1) % items.length;
      render();
    });

    updateScore();
    render();
  })();

})();
