'use strict';

/**
 * Structured-output schemas. Returning the brief as JSON (rather than free-form
 * markdown) makes citations machine-checkable: every `refs` entry must point at
 * a real deck item, which is how we enforce grounding (see synthesize.js).
 */
const cited = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    refs: { type: 'array', items: { type: 'integer' } },
  },
  required: ['title', 'summary', 'refs'],
};

const BRIEF_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    headline: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { text: { type: 'string' }, refs: { type: 'array', items: { type: 'integer' } } },
        required: ['text', 'refs'],
      },
    },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          items: { type: 'array', items: cited },
        },
        required: ['id', 'title', 'items'],
      },
    },
    movers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ticker: { type: 'string' },
          pct: { type: 'number' },
          volZ: { type: 'number' },
          note: { type: 'string' },
          refs: { type: 'array', items: { type: 'integer' } },
        },
        required: ['ticker', 'pct', 'volZ', 'note', 'refs'],
      },
    },
  },
  required: ['headline', 'sections', 'movers'],
};

const SCORE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    scores: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          score: { type: 'number' },
          reason: { type: 'string' },
        },
        required: ['id', 'score'],
      },
    },
  },
  required: ['scores'],
};

module.exports = { BRIEF_SCHEMA, SCORE_SCHEMA };
