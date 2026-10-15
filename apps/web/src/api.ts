export async function runIntegrationTest() {
  const r = await fetch('/api/integration/test');
  if (!r.ok) throw new Error(`Backend returned HTTP ${r.status}`);
  return r.json();
}

export async function getEvents() {
  const response = await fetch('/api/events');
  if (!response.ok) throw new Error(`Backend returned HTTP ${response.status}`);
  return response.json();
}
