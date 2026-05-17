exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'DEEPGRAM_API_KEY not configured' })
    };
  }

  try {
    const projectsRes = await fetch('https://api.deepgram.com/v1/projects', {
      headers: { 'Authorization': `Token ${apiKey}` }
    });
    const projectsData = await projectsRes.json();
    const projectId = projectsData.projects?.[0]?.project_id;
    if (!projectId) throw new Error('Could not get Deepgram project ID');

    const keyRes = await fetch(`https://api.deepgram.com/v1/projects/${projectId}/keys`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        comment: 'temp-browser',
        scopes: ['usage:write'],
        time_to_live_in_seconds: 300
      })
    });
    const keyData = await keyRes.json();
    if (!keyRes.ok) throw new Error(keyData.err_msg || 'Failed to create temp key');

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: keyData.key })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message })
    };
  }
};
