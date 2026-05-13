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

      // Check if a record already exists for this week label
      const searchUrl = new URL(`https://api.airtable.com/v0/${base}/${encodeURIComponent(TABLE)}`);
      searchUrl.searchParams.set('filterByFormula', `{Week Label}="${weekLabel}"`);
      searchUrl.searchParams.set('maxRecords', '1');

      const searchRes = await fetch(searchUrl.toString(), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!searchRes.ok) {
        const errBody = await searchRes.json().catch(() => ({}));
        throw new Error(errBody?.error?.message || `Airtable returned HTTP ${searchRes.status}`);
      }

      const searchData = await searchRes.json();
      const existing = searchData.records?.[0];

      // Only include days that have meals — never overwrite a day with blank
      const fields = {};
      DAYS.forEach(d => {
        const names = (plan[d] || []);
        if (names.length > 0) fields[d] = names.join(', ');
      });

      let res;
      if (existing) {
        // PATCH: merge into existing record, skipping empty days
        res = await fetch(`https://api.airtable.com/v0/${base}/${encodeURIComponent(TABLE)}/${existing.id}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields })
        });
      } else {
        // POST: create new record
        fields['Week Label'] = weekLabel;
        fields['Saved On'] = savedOn;
        res = await fetch(`https://api.airtable.com/v0/${base}/${encodeURIComponent(TABLE)}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields })
        });
      }

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
