// NAVI blueprint-driven HTML/CSS logo geometry engine.
// Every concept supplies its own coordinate-based composition; up to 16-point contours support more faithful organic silhouettes. No fixed family templates, SVG, canvas or raster assets.

function renderBlueprintGeometry(geometrySpec) {
  const invalid = message => { const error = new Error(message); error.diagnosticCode = "LOGO_BLUEPRINT_GEOMETRY_INVALID"; error.validationStage = "geometry-render"; throw error; };
  const tones = {
    primary: "linear-gradient(145deg,var(--logo-primary),var(--logo-primary))",
    secondary: "linear-gradient(145deg,var(--logo-primary),var(--logo-background))",
    accent: "linear-gradient(145deg,var(--logo-background),var(--logo-primary))",
    light: "linear-gradient(145deg,var(--logo-background),#f2eee4)",
    dark: "linear-gradient(145deg,#51483b,#211f1b)",
    paper: "linear-gradient(145deg,#fffdf7,#d8d0c2)"
  };
  const layers = Array.isArray(geometrySpec?.layers) ? geometrySpec.layers.slice(0, 8) : [];
  if (layers.length < 4 || layers.length > 8) invalid("NAVI geometry blueprint must contain 4–8 independent layers.");
  const html = [];
  const css = [
    ".navi-symbol{position:relative;display:block;width:72cqw;height:72cqw;max-width:72%;max-height:72%;margin:auto;overflow:visible;isolation:isolate}",
    ".navi-part{position:absolute;display:block;box-sizing:border-box;transform:translate(-50%,-50%) rotate(var(--part-rotation));transform-origin:center center}"
  ];
  const shapeAliases = {
    circle: "ellipse", oval: "ellipse", rect: "rounded-rect", rectangle: "rounded-rect",
    "round-rect": "rounded-rect", roundrect: "rounded-rect", rounded_rectangle: "rounded-rect",
    rhombus: "diamond", lozenge: "diamond", line: "capsule", stroke: "capsule",
    freeform: "polygon", custom: "polygon"
  };
  const toneAliases = {
    gold: "secondary", brass: "secondary", bronze: "secondary", cyan: "accent",
    teal: "accent", silver: "light", white: "light", ivory: "paper",
    cream: "paper", navy: "dark", black: "dark", blue: "primary"
  };
  const finishAliases = { matte: "none", flat: "none", satin: "soft", glossy: "metal", polished: "metal", shadow: "soft" };
  layers.forEach((layer, index) => {
    let shape = String(layer?.shape || "").toLowerCase().trim();
    shape = shapeAliases[shape] || shape;
    let tone = String(layer?.tone || "primary").toLowerCase().trim();
    tone = toneAliases[tone] || tone;
    let finish = String(layer?.finish || "soft").toLowerCase().trim();
    finish = finishAliases[finish] || finish;
    const x = Number(layer?.x), y = Number(layer?.y);
    const width = Number(layer?.width), height = Number(layer?.height);
    const rotation = Number(layer?.rotation ?? 0);
    if (!["ellipse","rounded-rect","capsule","diamond","polygon"].includes(shape)) {
      shape = Array.isArray(layer?.points) && layer.points.length >= 3 ? "polygon" : "rounded-rect";
    }
    if (!Object.prototype.hasOwnProperty.call(tones, tone)) tone = "primary";
    if (!["none","soft","metal"].includes(finish)) finish = "soft";
    if (![x,y,width,height,rotation].every(Number.isFinite) ||
        x < 0 || x > 100 || y < 0 || y > 100 ||
        width < 5 || width > 100 || height < 5 || height > 100 ||
        rotation < -180 || rotation > 180) {
      invalid("NAVI geometry blueprint contains an invalid primitive.");
    }
    const className = "navi-part-" + (index + 1);
    let contour = "border-radius:12%";
    if (shape === "ellipse") contour = "border-radius:50%";
    if (shape === "capsule") contour = "border-radius:999px";
    if (shape === "diamond") contour = "border-radius:8%;transform:translate(-50%,-50%) rotate(calc(var(--part-rotation) + 45deg))";
    if (shape === "polygon") {
      let points = Array.isArray(layer.points) ? layer.points.slice(0, 16) : [];
      const validPoints = points.length >= 3 && points.length <= 16 &&
        points.every(point => Array.isArray(point) && point.length === 2 &&
          point.every(value => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100));
      if (!validPoints) {
        // Models occasionally label a primitive as polygon but omit its vertices.
        // Keep the layer usable as a clean geometric surface instead of failing the whole request.
        shape = "diamond";
        contour = "border-radius:8%;transform:translate(-50%,-50%) rotate(calc(var(--part-rotation) + 45deg))";
      } else {
        contour = "clip-path:polygon(" + points.map(point => Number(point[0]) + "% " + Number(point[1]) + "%").join(",") + ")";
      }
    }
    const finishCss = finish === "none" ? "" : finish === "metal"
      ? "border:1px solid rgba(255,255,255,.55);box-shadow:inset 0 1.2cqw 1.5cqw rgba(255,255,255,.38),0 1.8cqw 2.4cqw rgba(12,20,30,.2)"
      : "border:1px solid rgba(35,45,58,.12);box-shadow:0 1.6cqw 2.2cqw rgba(12,20,30,.16),inset 0 1cqw 1cqw rgba(255,255,255,.24)";
    html.push('<span class="navi-part ' + className + '" aria-hidden="true"></span>');
    css.push("." + className + "{left:" + x + "%;top:" + y + "%;width:" + width + "%;height:" + height +
      "%;--part-rotation:" + rotation + "deg;background:" + tones[tone] + ";" + contour + ";" + finishCss + "}");
  });
  return { html: html.join(""), css: css.join("\n"), layerCount: layers.length };
}

function wordmarkHtml(data) {
  return '<div class="logo-lockup"><div class="wordmark-only"><span data-logo-role="brand">{{BRAND_NAME}}</span></div>' +
    (data.slogan ? '<small class="slogan-only" data-logo-role="slogan">{{SLOGAN}}</small>' : "") + '</div>';
}

// Each concept is rendered from its own NAVI-authored geometric blueprint.
// No subject-family template or index-based silhouette is selected.
export function buildStructuredLogoConcepts(data, blueprints) {
  const count = Math.min(blueprints.length, data.singleConcept ? 1 : 3);
  const concepts = [];
  for (let index = 0; index < count; index += 1) {
    const blueprint = blueprints[index] || {};
    const geometry = data.format === "wordmark" ? { html: "", css: "", layerCount: 0 } :
      renderBlueprintGeometry(blueprint.geometrySpec);
    const html = data.format === "wordmark"
      ? wordmarkHtml(data)
      : '<div class="mark-lockup"><div class="navi-symbol" data-logo-role="symbol">' +
        geometry.html +
        '</div><div class="brand-lockup"><strong data-logo-role="brand">{{BRAND_NAME}}</strong>' +
        (data.slogan ? '<small data-logo-role="slogan">{{SLOGAN}}</small>' : "") +
        '</div></div>';
    const css = [
      '.logo-art-root{display:grid;place-items:center;padding:7%;direction:rtl;text-align:center;font-family:Arial,Tahoma,sans-serif;color:var(--logo-primary)}',
      '.mark-lockup{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5cqw}',
      geometry.css,
      '.brand-lockup{max-width:90%;display:flex;flex-direction:column;align-items:center;gap:1.5cqw;margin-top:1cqw}',
      '.brand-lockup strong{display:block;color:var(--logo-primary);font-size:clamp(28px,7cqw,76px);font-weight:850;line-height:1.3;letter-spacing:-.035em;direction:auto;unicode-bidi:plaintext;text-wrap:balance}',
      '.brand-lockup small{display:block;color:var(--logo-primary);font-size:clamp(13px,2.8cqw,27px);font-weight:500;line-height:1.5;opacity:.78;direction:auto;unicode-bidi:plaintext}',
      '.logo-lockup{width:100%;height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:3cqw}',
      '.wordmark-only{font-size:clamp(34px,10cqw,110px);font-weight:900;line-height:1.2;letter-spacing:-.04em;color:var(--logo-primary);direction:auto;unicode-bidi:plaintext}',
      '.slogan-only{font-size:clamp(15px,3cqw,30px);opacity:.78;direction:auto;unicode-bidi:plaintext}'
    ].join('\n');
    const anchors = (blueprint.briefElements || []).slice(0, 4);
    const visualAnchors = anchors.length
      ? anchors.map((description, i) => ({ id: "anchor-" + (i + 1), description, relationship: i === 0 ? "primary silhouette" : "integrated in the central mark" }))
      : [{ id: "anchor-1", description: blueprint.firstRead || "brand identity", relationship: "primary silhouette" }];
    concepts.push({
      index: index + 1,
      title: blueprint.title || "مسیر طراحی " + (index + 1),
      rationale: blueprint.rationale || blueprint.centralThesis || "",
      metaphor: blueprint.metaphor || "",
      meaningChain: blueprint.meaningChain || blueprint.symbolConstruction || "",
      centralThesis: blueprint.centralThesis || "",
      briefElements: anchors.length ? anchors : [blueprint.firstRead || "brand identity"],
      symbolConstruction: blueprint.symbolConstruction || "",
      briefAlignment: blueprint.briefAlignment || "",
      visualAnchors,
      anchorMap: visualAnchors.map((anchor, i) => ({
        anchorId: anchor.id,
        layerClass: data.format === "wordmark" ? "navi-symbol" : "navi-part-" + (Math.min(i, geometry.layerCount - 1) + 1),
        visualRole: "visible geometric layer in the independently constructed symbol"
      })),
      mechanism: "NAVI-authored geometric blueprint rendered by a constrained native HTML/CSS primitive engine.",
      expressionMove: blueprint.signatureFeature || "",
      semanticGeometry: ["blueprint-driven-" + geometry.layerCount + "-layer-mark"],
      semanticGeometryNote: "Every visible layer is generated from this concept's own geometry blueprint; no family silhouette is reused.",
      geometryRecipe: blueprint.geometryRecipe || "",
      executionBriefEnglish: blueprint.executionBriefEnglish || "",
      geometryLayerRoles: (blueprint.geometrySpec?.layers || []).map(layer => layer.visualRole || ""),
      spatialRelationship: blueprint.spatialRelationship || "",
      negativeSpace: blueprint.negativeSpace || "",
      differsBy: blueprint.signatureFeature || "Independent geometry blueprint",
      axes: { "ساختار": blueprint.silhouette || "blueprint geometry", "پرداخت": blueprint.materialDirection || "concept-specific" },
      defaultsUsed: [],
      html,
      css
    });
  }
  return { family: "blueprint", concepts };
}
