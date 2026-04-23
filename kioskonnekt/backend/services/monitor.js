const { EventEmitter } = require('events');
const { dbInsert, dbSelect, dbUpdate, dbGetStats } = require('../db/supabase');

const emitter = new EventEmitter();

const state = {
  backend: {
    api: { status: 'operational', last_seen_at: new Date().toISOString(), details: { message: 'API online' } },
    database: { status: 'unknown', last_seen_at: new Date().toISOString(), details: { message: 'Waiting for first DB check' } },
    memory: { status: 'operational', last_seen_at: new Date().toISOString(), details: { used_mb: 0 } }
  },
  kiosks: {}
};

let monitorTimer = null;

function normalizeStatus(value) {
  const v = String(value || '').toLowerCase();
  if (v === 'operational' || v === 'degraded' || v === 'down') return v;
  return 'unknown';
}

function pushEvent(event, payload) {
  emitter.emit(event, {
    event,
    timestamp: new Date().toISOString(),
    payload
  });
}

function setBackendComponent(name, status, details = {}) {
  state.backend[name] = {
    status: normalizeStatus(status),
    details,
    last_seen_at: new Date().toISOString()
  };
  pushEvent('status-update', { scope: 'backend', component: name, value: state.backend[name] });
}

async function recordSystemFailure({
  component,
  category = 'runtime',
  severity = 'error',
  message,
  metadata = {}
}) {
  if (!component || !message) return;

  const entry = {
    component,
    category,
    severity,
    message,
    metadata,
    resolved: false,
    created_at: new Date().toISOString()
  };

  try {
    await dbInsert('system_failures', entry);
  } catch (err) {
    // Keep monitor resilient even when persistence fails.
    console.error('Failed to persist system failure:', err.message);
  }

  pushEvent('failure', entry);
}

async function getRecentFailures(limit = 50) {
  const { data, error } = await dbSelect('system_failures');
  if (error) throw error;
  return (data || [])
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, limit);
}

async function resolveFailure(id) {
  return dbUpdate('system_failures', id, {
    resolved: true,
    resolved_at: new Date().toISOString()
  });
}

function reportKioskHeartbeat({ kiosk_id, page, components = {}, metadata = {} }) {
  const kioskId = kiosk_id || 'kiosk-default';
  const now = new Date().toISOString();

  const normalizedComponents = {};
  Object.entries(components || {}).forEach(([component, value]) => {
    const normalized = {
      status: normalizeStatus(value?.status || value),
      last_seen_at: now,
      details: value?.details || {}
    };
    normalizedComponents[component] = normalized;

    if (normalized.status === 'down' || normalized.status === 'degraded') {
      recordSystemFailure({
        component: `kiosk:${component}`,
        category: 'component_health',
        severity: normalized.status === 'down' ? 'critical' : 'warning',
        message: `Kiosk component ${component} is ${normalized.status}`,
        metadata: { kiosk_id: kioskId, page, ...normalized.details }
      });
    }
  });

  state.kiosks[kioskId] = {
    kiosk_id: kioskId,
    page: page || 'unknown',
    metadata,
    last_seen_at: now,
    components: {
      ...(state.kiosks[kioskId]?.components || {}),
      ...normalizedComponents
    }
  };

  pushEvent('status-update', { scope: 'kiosk', kiosk_id: kioskId, value: state.kiosks[kioskId] });
  return state.kiosks[kioskId];
}

function getStatusSnapshot() {
  const now = Date.now();
  const kiosks = Object.values(state.kiosks).map((kiosk) => {
    const ageMs = now - new Date(kiosk.last_seen_at || 0).getTime();
    return {
      ...kiosk,
      stale: ageMs > 30000
    };
  });

  return {
    backend: state.backend,
    kiosks,
    generated_at: new Date().toISOString()
  };
}

async function runBackendChecks() {
  setBackendComponent('api', 'operational', {
    uptime_seconds: Math.floor(process.uptime())
  });

  const usedMb = Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100;
  const memoryStatus = usedMb > 650 ? 'degraded' : 'operational';
  setBackendComponent('memory', memoryStatus, { used_mb: usedMb });

  try {
    await dbGetStats();
    setBackendComponent('database', 'operational', { message: 'Connected' });
  } catch (err) {
    setBackendComponent('database', 'down', { message: err.message || 'DB check failed' });
    await recordSystemFailure({
      component: 'backend:database',
      category: 'db_health',
      severity: 'critical',
      message: `Database health check failed: ${err.message || 'Unknown error'}`
    });
  }
}

function startMonitor() {
  if (monitorTimer) return;
  runBackendChecks();
  monitorTimer = setInterval(runBackendChecks, 10000);
}

function stopMonitor() {
  if (!monitorTimer) return;
  clearInterval(monitorTimer);
  monitorTimer = null;
}

module.exports = {
  startMonitor,
  stopMonitor,
  getStatusSnapshot,
  getRecentFailures,
  resolveFailure,
  reportKioskHeartbeat,
  recordSystemFailure,
  events: emitter
};
