const { getStore } = require('@netlify/blobs');

// ---- Config ----------------------------------------------------------
const STORE_NAME = 'crystal-burst';
const AGGREGATE_KEY = 'aggregate';
const ACTIVE_WINDOW_MS = 5 * 60 * 1000;        // "active now" = seen in last 5 min
const STALE_PLAYER_MS = 30 * 24 * 60 * 60 * 1000; // prune players unseen for 30 days

// ---- Helpers -----------------------------------------------------------
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
}

function json(statusCode, body) {
  return { statusCode, headers: corsHeaders(), body: JSON.stringify(body) };
}

// Nicknames are the player's identity. There's no password behind them —
// two people using the same name will share a record. That's the trade-off
// for "your progress survives clearing your browser" without building an
// account/login system.
function normalizeKey(nickname) {
  return (nickname || '').toString().trim().toLowerCase().slice(0, 24);
}

function defaultAggregate() {
  return {
    players: {},                              // key -> { displayName, highScore, lastSeen }
    globalHigh: { displayName: null, score: 0 },
    totalVisits: 0,
  };
}

async function loadAggregate(store) {
  const data = await store.get(AGGREGATE_KEY, { type: 'json' });
  if (!data) return defaultAggregate();
  data.players = data.players || {};
  data.globalHigh = data.globalHigh || { displayName: null, score: 0 };
  data.totalVisits = data.totalVisits || 0;
  return data;
}

function pruneStale(aggregate) {
  const cutoff = Date.now() - STALE_PLAYER_MS;
  for (const key in aggregate.players) {
    if (aggregate.players[key].lastSeen < cutoff) delete aggregate.players[key];
  }
}

function publicStats(aggregate) {
  const now = Date.now();
  let activePlayers = 0;
  for (const key in aggregate.players) {
    if (now - aggregate.players[key].lastSeen < ACTIVE_WINDOW_MS) activePlayers++;
  }
  return {
    totalVisits: aggregate.totalVisits,
    activePlayers,
    globalHigh: aggregate.globalHigh,
  };
}

// ---- Handler -------------------------------------------------------------
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  const store = getStore({ name: STORE_NAME, consistency: 'strong' });

  try {
    if (event.httpMethod === 'GET') {
      const aggregate = await loadAggregate(store);
      return json(200, publicStats(aggregate));
    }

    if (event.httpMethod === 'POST') {
      let body;
      try {
        body = JSON.parse(event.body || '{}');
      } catch (e) {
        return json(400, { error: 'invalid JSON body' });
      }

      const key = normalizeKey(body.nickname);
      if (!key) return json(400, { error: 'nickname required' });
      const displayName = (body.nickname || '').toString().trim().slice(0, 16);

      const aggregate = await loadAggregate(store);
      const isNewPlayer = !aggregate.players[key];

      if (isNewPlayer) {
        aggregate.players[key] = { displayName, highScore: 0, lastSeen: Date.now() };
        aggregate.totalVisits += 1;
      } else {
        aggregate.players[key].lastSeen = Date.now();
        aggregate.players[key].displayName = displayName; // keep latest casing
      }

      if (body.action === 'submit-score') {
        const score = Math.round(Number(body.score));
        if (Number.isFinite(score) && score > 0) {
          if (score > aggregate.players[key].highScore) {
            aggregate.players[key].highScore = score;
          }
          if (score > aggregate.globalHigh.score) {
            aggregate.globalHigh = { displayName, score };
          }
        }
      }

      pruneStale(aggregate);
      await store.setJSON(AGGREGATE_KEY, aggregate);

      return json(200, {
        ...publicStats(aggregate),
        yourHighScore: aggregate.players[key].highScore,
      });
    }

    return json(405, { error: 'method not allowed' });
  } catch (err) {
    return json(500, { error: err.message || 'server error' });
  }
};
