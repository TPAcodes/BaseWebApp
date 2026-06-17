'use strict';

/** All built-in source kinds. Register a new kind here (or at runtime) and it
 * becomes usable from config immediately. */
const KINDS = {
  rss: require('./rss'),
  arxiv: require('./arxiv'),
  hackernews: require('./hackernews'),
  x: require('./x'),
  sec: require('./sec'),
};

function registerKinds(registry, extra = {}) {
  for (const [name, factory] of Object.entries({ ...KINDS, ...extra })) {
    registry.registerKind(name, factory);
  }
  return registry;
}

module.exports = { KINDS, registerKinds };
