exports.handler = async function () {
  const token = process.env.AIRTABLE_TOKEN;
  const base  = process.env.AIRTABLE_BASE;
  const table = process.env.AIRTABLE_TABLE;

  if (!token || !base || !table) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Airtable environment variables are not configured.' })
    };
  }

  try {
    const records = await fetchAllRecords(token, base, table);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records })
    };
  } catch (err) {
    return {
      statusCode: 502,
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
