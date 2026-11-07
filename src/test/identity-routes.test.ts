import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { identityRoutes } from '../server/routes/identity.js';
import { deriveBrowserIdentity } from '../browser/identity.js';
const ua = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';
describe('identity API', () => {
  it('accepts literal UA, returns the applied identity and rejects malformed input before changing state', async () => {
    let value = deriveBrowserIdentity(ua);
    const app = express(); app.use(express.json());
    app.use('/api', identityRoutes(async input => {value = deriveBrowserIdentity(input || ua);}, () => value));
    expect((await request(app).post('/api/identity').send({userAgent: ua})).status).toBe(200);
    expect((await request(app).get('/api/identity')).body.data).toMatchObject({userAgent:ua,platform:'Linux x86_64'});
    expect((await request(app).post('/api/identity').send({userAgent: 'bad\r\nheader'})).status).toBe(400);
    expect((await request(app).post('/api/identity').send({userAgent: {ua}})).status).toBe(400);
    expect((await request(app).post('/api/identity').send({userAgent: null})).status).toBe(200);
  });
});
