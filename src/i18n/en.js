// English UI strings. Keys are dot-namespaced by surface. The pure engine
// (ikigai.js / policy.js) keeps its own English labels for the LLM contract;
// these are the *display* strings, so the UI can translate without touching it.
export default {
  'brand.tagline': 'your purpose, as a map you fly toward',

  // axis display labels (mirror AXIS_LABEL, but UI-owned so they can localize)
  'axis.love': 'What you love',
  'axis.good': "What you're good at",
  'axis.world': 'What the world needs',
  'axis.paid': 'What you can be paid for',
  'axis.short.love': 'LOVE',
  'axis.short.good': 'GOOD',
  'axis.short.world': 'WRLD',
  'axis.short.paid': 'PAID',
  'axis.name.love': 'love',
  'axis.name.good': 'good',
  'axis.name.world': 'world',
  'axis.name.paid': 'paid',

  // map
  'map.aria': 'ikigai map — click to place an activity, drag the marker to aim',
  'map.hint': 'click a spot, or describe yourself → your dot lands here',
  'map.youarehere': 'you are here',
  'map.dragToAim': 'drag to aim',
  'map.clickToPlace': 'click to place',
  'map.tip.lead': 'The map is the input.',
  'map.tip.body': 'Click to place an activity · drag your dot to simulate a move · click a past dot to revisit',
  'map.desired': 'desired',
  'map.history': 'a past state — click to simulate revisiting it',

  // simulation
  'sim.title': 'Simulated move',
  'sim.vsCurrent': 'vs now',
  'sim.coach': 'Coach me toward this',
  'sim.clear': 'clear',

  // regions
  'region.Passion': 'Passion',
  'region.Mission': 'Mission',
  'region.Profession': 'Profession',
  'region.Vocation': 'Vocation',

  // instrument strip
  'strip.of': '/1.0',
  'strip.state': 'State',
  'strip.bottleneck': 'bottleneck:',
  'strip.empty': 'no activity yet — place one',
  'strip.settings': 'settings — connect LLM, import/export',

  // axis instrument
  'instrument.title': 'AXIS SCORES',
  'instrument.foot': 'weakest axis caps I · gradient → {axis}',

  // coach
  'coach.title': 'Coach',
  'coach.empty': "Tell me what you actually spend your time on — a job, a project, a hobby you keep coming back to — and I'll place you on the map. Or {demo} to watch a full journey first.",
  'coach.empty.demo': 'try the demo',
  'coach.thinking': 'thinking…',
  'coach.interview': "Tell me what you actually spend time on — a job, a project, a hobby you keep coming back to — and I'll place you on the map.",
  'coach.demoNote': 'Demo journey loaded — a "comfortable but empty" engineer with a music-tools passion. Explore the map and the math; add an LLM to keep coaching.',
  'coach.imported': 'Journey imported. Pick up where you left off.',

  // composer
  'composer.placeholder.empty': 'Describe an activity… or click the map to place one.',
  'composer.placeholder.reply': 'Reply, or describe what you tried…',
  'composer.demo': 'try the demo',
  'composer.clickmap': '＋ or click the map',
  'composer.clickmap.title': 'Click anywhere on the map to drop an activity',
  'composer.send': 'send',
  'composer.tip': 'This conversation is the main input — the map, score, and bars all update from what you say here.',
  'composer.tip.nollm': 'This conversation is the main input — the map, score, and bars all update from what you say here (connect an LLM via ⚙, or try the demo).',

  // move badges
  'move.explore': 'explore',
  'move.exploit': 'exploit',
  'move.adjacent': 'adjacent',
  'move.radical': 'radical',
  'move.keep': 'keep',
  'move.improve': 'improve',
  'move.stop': 'stop',

  // map-click draft (a natural, complete sentence — never a dangling lead-in)
  'draft.but': 'but',
  'draft.pos.love': 'I love it',
  'draft.pos.good': "I'm good at it",
  'draft.pos.world': 'the world needs it',
  'draft.pos.paid': 'it pays well',
  'draft.neg.love': "I don't really love it",
  'draft.neg.good': "I'm not especially good at it",
  'draft.neg.world': "the world doesn't really need it",
  'draft.neg.paid': "it doesn't pay well",
  'draft.empty': "I'm not sure how to describe this one yet.",

  // config
  'config.title': 'Settings',
  'config.close': 'close',
  'config.engine': 'AI engine',
  'config.engine.byo': 'Your own endpoint',
  'config.engine.browser': 'Run in browser (no setup)',
  'config.engine.model': 'Browser model',
  'config.engine.note': 'Runs a model on your device — fast with WebGPU, or a slower CPU fallback without it. One-time download; nothing leaves your machine.',
  'config.webgpu.ok': 'WebGPU detected ✓ — fast in-browser model',
  'config.webgpu.no': 'No WebGPU — runs on CPU instead (slower, smaller model). For speed, use desktop Chrome/Edge or your own endpoint.',
  'config.byo': 'Bring your own LLM',
  'config.baseUrl': 'Base URL (OpenAI-compatible)',
  'config.apiKey': 'API key (optional for local)',
  'config.apiKey.ph': 'sk-… or blank',
  'config.model': 'Model',
  'config.model.ph': 'local / gpt-4o-mini / …',
  'config.save': 'Save config',
  'config.journey': 'Journey file (.sqlite)',
  'config.export': 'Export',
  'config.import': 'Import',
  'config.journey.note': 'Export anytime, plug the file back in on any machine.',
  'config.language': 'Language',

  // model-source front doors (one engine, three doors; Claude Code ships now)
  'config.doors': 'Other ways to run ikigaider',
  'config.doors.soon': 'soon',
  'config.door.selfhost': 'Self-host',
  'config.skill.get': 'Download skill',
  'config.skill.note': 'Same engine, in your terminal — your own model coaches, no key. Unzip into ~/.claude/skills/ and run /ikigaider.',

  // misc
  'app.loading': 'Loading…',
  'app.initFailed': 'Init failed: {msg}',
  'llm.loading': 'Loading local model… {pct}%',
  'llm.fallback': 'Couldn’t reach your endpoint, so I’m coaching with the in-browser model for now. Fix it under ⚙ to switch back.',
};
