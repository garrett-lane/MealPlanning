const ALLOWED_ORIGINS = [
  'https://meals.gthompson.me',
  'http://localhost',
  'http://127.0.0.1',
  'null' // file:// opens with origin "null"
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET',
    'Content-Type': 'application/json'
  };
}

exports.handler = async function (event) {
  const origin = event.headers?.origin || 'null';
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(origin), body: '' };
  }

  const token = process.env.AIRTABLE_TOKEN;
  const base  = process.env.AIRTABLE_BASE;
  const table = process.env.AIRTABLE_TABLE;

  if (!token || !base || !table) {
    return {
      statusCode: 500,
      headers: corsHeaders(origin),
      body: JSON.stringify({ error: 'Airtable environment variables are not configured.' })
    };
  }

  try {
    const records = await fetchAllRecords(token, base, table);
    return {
      statusCode: 200,
      headers: corsHeaders(origin),
      body: JSON.stringify({ records })
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: corsHeaders(origin),
      body: JSON.stringify({ error: err.message })
    };
  }
};

async function fetchAllRecords(token, base, table) {
  const records = [];
  let offset = null;

  do {
    const url = new URL(`https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}`);
    if (offset) url.searchParams.set('offset', offset);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error?.message || `Airtable returned HTTP ${res.status}`);
    }

    const data = await res.json();
    records.push(...(data.records || []));
    offset = data.offset || null;
  } while (offset);

  return records;
}
