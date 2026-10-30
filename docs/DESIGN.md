# SAA visual specification

Primary concept: `ui-concept.png`, generated with the built-in Image Gen tool. The original Pluely screenshot was inspected as a reference for layout/material. The generated concept is a reference image only; all shipped controls/text are implemented in React/CSS.

## Concept brief
A complete Windows floating chatbot screen named SAA, dark neutral transparent panel, rounded outline, Chat toolbar, History and Settings, custom model row, Latest/All messages selector, spacious empty chat, three text suggestions, three followups, bottom image-capable composer, opacity slider, passive overlay control, shortcut hints. No meetings, microphone, audio or dashboard. Segoe UI/Inter-like typography, neutral white/gray text, thin outline icons, restrained green connection status. Full generation prompt retained in `design-prompt.txt`.

## Tokens and families
Charcoal panel RGB 21/24/27 with adjustable 35–100% alpha, true transparent desktop root. Primary text #f1f2f3, secondary #b2b5bb, muted #999da4, white border 13% alpha. Large panel radius18px (native13px), composer15px, buttons7–10px, followup pills99px. Segoe UI with sans fallback, weights400/550/600/650. Dense UI sizes12–16px; main heading40px,48px at concept viewport. Lucide outline icons with neutral stroke. A single panel framing open chat space, no dashboard/card grid.

## Required additions to the concept
- Paste clipboard button is necessary for input while retaining browser focus.
- Capture and click-through buttons expose requested overlay/chat capabilities.
- Status dot is gray until a model is configured; green only indicates configuration, not a live provider health test.
- Passive switch is visibly on by default.
- Send is an up-arrow to match the original Pluely interaction, rather than the generated paper-plane.
- Browser preview footer truthfully identifies the preview; native desktop footer shows configuration/passive state.
- Settings and history use the same open surface, typography and form language; no unrelated dashboard.
- Background texture in the raster concept is omitted intentionally: desktop content supplies real transparency, while the browser preview uses a neutral background.

## Allowed primary copy
SAA; Chat; History; Settings; Custom API; Your model; Latest; All messages; A little clarity, on demand.; Ask a question, attach an image, or bring context from your screen.; Explain something; Help me write; Think it through; Make it simpler; Go deeper; Give an example; Ask anything, or paste an image…; Passive overlay; Show / hide; Connect your API in Settings. Model/configuration/state/error copy is functional dynamic content.


## Generated design artifact
The concept was generated with the built-in Image Gen tool; the exact prompt is docs/design-prompt.txt and the workspace artifact is docs/ui-concept.png. It is not embedded as application UI. All controls, content and transparency are implemented in code.

## Provider settings reference, v0.1.4
The supplied AI-providers image informs the settings rows: label/help on the left, field/actions on the right, with separators for active provider, endpoint, model, key, system prompt, temperature, max tokens and validation. SAA retains its established charcoal/translucent material, Segoe UI type scale, muted gray copy and rounded controls. Rows stack at narrow widths. Save remains available at the bottom while the settings surface scrolls.

The provider picker uses an in-panel menu of ordinary buttons, preserving passive mouse routing and avoiding a system select popup. The chat header exposes the same four providers and shows the selected model. Key status reflects only whether a credential is stored; no saved key is rendered. Validation feedback explicitly describes a models-endpoint check rather than a guarantee of chat access.
