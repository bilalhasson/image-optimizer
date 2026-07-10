import './style.css';
import { render } from './render';
import './compare'; // before/after slider — attaches its own listeners
import './controls'; // all control + nav + drag/drop wiring

/**
 * squish — client-side image compressor, converter & resizer.
 * Entry point: wire the modules and paint the initial (empty) state.
 *
 * Module map:
 *   state    — shared app state + Item model
 *   dom      — cached element handles
 *   render   — view layer (render/detail/summary/rows) + settings-derived UI + nav
 *   encode   — worker-pool orchestration (encodeItem, reencodeAll)
 *   intake   — file screening (type/animated/HEIC) + adding items
 *   controls — event wiring for the controls, file inputs, drag/drop, theme
 *   compare  — the before/after comparison slider
 *   download — single + zip download
 *   sniff / format / toast — small helpers
 *   codecs / pool / worker — the WASM encode engine (unchanged)
 */
render();
