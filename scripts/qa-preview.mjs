import http from 'node:http';
import { page } from '../src/worker/ui/page.ts';
import { suggestDays } from '../src/lib/suggest.ts';

const days = Array.from({ length: 10 }, (_, d) => ({
  id: `day-${d}`, date: new Date(Date.UTC(2026, 8, 24 + d)).toISOString().slice(0, 10),
  label: `Day ${d + 1}`, hue: ['#3F6B4A', '#6E8CA8', '#C4826A'][d % 3], place_label: 'New York',
  stops: Array.from({ length: d === 9 ? 20 : 6 }, (_, s) => ({
    id: `stop-${d}-${s}`, title: s === 0 ? 'Rain backup: choose an indoor museum' : `Museum and gardens ${d + 1} / ${s + 1}`,
    time: d === 0 && s === 1 ? '09:30' : '', note: s === 0 ? 'Meet by the entrance\nBring tickets\nAllow time for lunch' : '',
    description: 'museum', author: 'QA', authorColor: '#6E8CA8', status: 'ahead',
    location: { lat: 40.7 + d * 0.01, lng: -74 + s * 0.008 },
  })),
}));
const trip = { trip: { id: 'qa', name: 'Local QA · 10 days', start_date: days[0].date, end_date: days[9].date }, days,
  unplanned: [{ id: 'backup', title: 'Rain backup: choose an indoor museum', time: '', description: 'activity', author: 'QA', authorColor: '#6E8CA8' }],
  lodging: [{ id: 'stay', name: 'Local QA hotel', check_in: days[0].date, check_out: days[9].date, note: 'Check in at reception\nBring ID', lat: 40.72, lng: -74 }],
  members: [], dateRange: 'Sep 24 – Oct 3', me: { initials: 'QA' },
};
http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.url.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/trips') return res.end(JSON.stringify({ trips: [], me: { initials: 'QA', name: 'Local QA' }, invite: null }));
    if (req.url === '/api/trips/qa') return res.end(JSON.stringify(trip));
    const match = /^\/api\/stops\/([^/]+)\/(time|move|move-options)$/.exec(req.url);
    if (match) {
      const day = days.find((d) => d.stops.some((s) => s.id === match[1]));
      const list = day?.stops || trip.unplanned;
      const stop = list.find((s) => s.id === match[1]);
      if (stop) {
        if (match[2] === 'move-options') {
          const suggestion = suggestDays({ id: stop.id, name: stop.title, location: stop.location || null, city: 'New York', currentDayId: day?.id || null }, days.map((d) => ({ ...d, placeLabel: 'New York', city: 'New York', stops: d.stops.map((s) => ({ id: s.id, name: s.title, location: s.location })) })), '2026-09-15');
          return res.end(JSON.stringify({ stop: { id: stop.id, name: stop.title, currently: day?.label || 'To be planned' }, ...suggestion }));
        }
        let raw = '';
        for await (const part of req) raw += part;
        const body = JSON.parse(raw);
        if (match[2] === 'time') stop.time = body.time;
        else {
          const target = body.dayId ? days.find((d) => d.id === body.dayId).stops : trip.unplanned;
          list.splice(list.indexOf(stop), 1);
          const at = body.afterStopId === undefined ? target.length : body.afterStopId === null ? 0 : target.findIndex((s) => s.id === body.afterStopId) + 1;
          target.splice(at, 0, stop);
          if (body.startTime !== undefined) stop.time = body.startTime;
        }
        return res.end('{}');
      }
    }
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Read-only local fixture' }));
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(page());
}).listen(4183, '127.0.0.1', () => console.log('Local QA: http://127.0.0.1:4183/trips/qa'));
