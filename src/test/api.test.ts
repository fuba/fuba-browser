import { describe, it, expect } from 'vitest';

const API_BASE = 'http://localhost:39001';

describe('API Tests', () => {
  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await fetch(`${API_BASE}/health`);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.version).toBe('0.1.0');
    });
  });
  
  describe('Browser Control', () => {
    it('should navigate to URL', async () => {
      const response = await fetch(`${API_BASE}/api/navigate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com' })
      });
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.url).toBe('https://example.com');
    });
    
    it('should scroll page', async () => {
      const response = await fetch(`${API_BASE}/api/scroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: 0, y: 100 })
      });
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.y).toBe(100);
    });
    
    it('should take screenshot', async () => {
      const response = await fetch(`${API_BASE}/api/screenshot`);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('image/png');
    });
  });
  
  describe('Content Extraction', () => {
    it('should get page content', async () => {
      const response = await fetch(`${API_BASE}/api/content`);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('html');
      expect(data.data).toHaveProperty('markdown');
      expect(data.data).toHaveProperty('elements');
      expect(data.data).toHaveProperty('url');
      expect(data.data).toHaveProperty('title');
    });
    
    it('should get interactive elements', async () => {
      const response = await fetch(`${API_BASE}/api/elements`);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
    });
  });
  
  describe('Session Management', () => {
    it('should get cookies', async () => {
      const response = await fetch(`${API_BASE}/api/cookies`);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
    });
    
    it('should get session info', async () => {
      const response = await fetch(`${API_BASE}/api/session`);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('url');
      expect(data.data).toHaveProperty('title');
      expect(data.data).toHaveProperty('cookiesCount');
    });
  });
});