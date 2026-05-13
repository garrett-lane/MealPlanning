const ALLOWED_ORIGINS = [
  'https://meals.gthompson.me',
  'http://localhost',
  'http://127.0.0.1',
  'null'
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
}

const TABLE = 'Week Plans';
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

exports.handler = async function(event) {
  const origin = event.headers?.origin || 'null';

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(origin), body: '' };
  }

  const token = process.env.AIRTABLE_TOKEN;
  const base  = process.env.AIRTABLE_BASE;

  if (!token || !base) {
    return {
      statusCode: 500,
      headers: corsHeaders(origin),
      body: JSON.stringify({ error: 'Airtable environment variables are not configured.' })
    };
  }

  if (event.httpMethod === 'GET') {
    try {
      const url = new URL(`https://api.airtable.com/v0/${base}/${encodeURIComponent(TABLE)}`);
      url.searchParams.set('sort[0][field]', 'Saved On');
      url.searchParams.set('sort[0][direction]', 'desc');

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message || `Airtable returned HTTP ${res.status}`);
      }

      const data = await res.json();
      return {
        statusCode: 200,
        headers: corsHeaders(origin),
        body: JSON.stringify({ records: data.records || [] })
      };
    } catch (err) {
      return {
        statusCode: 502,
        headers: corsHeaders(origin),
        body: JSON.stringify({ error: err.message })
      };
    }
  }

  if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body || '{}');
      const { weekLabel, plan, savedOn } = body;

      const fields = { 'Week Label': weekLabel, 'Saved On': savedOn };
      DAYS.forEach(d => {
        fields[d] = (plan[d] || []).join(', ');
      });

      const res = await fetch(`https://api.airtable.com/v0/${base}/${encodeURIComponent(TABLE)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields })
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody?.error?.message || `Airtable returned HTTP ${res.status}`);
      }

      const data = await res.json();
      return {
        statusCode: 200,
        headers: corsHeaders(origin),
        body: JSON.stringify({ record: data })
      };
    } catch (err) {
      return {
        statusCode: 502,
        headers: corsHeaders(origin),
        body: JSON.stringify({ error: err.message })
      };
    }
  }

  return {
    statusCode: 405,
    headers: corsHeaders(origin),
    body: JSON.stringify({ error: 'Method not allowed' })
  };
};
