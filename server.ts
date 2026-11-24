import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProd = process.env.NODE_ENV === 'production';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function buildZipArchive(rootDir: string): Buffer {
  const includeRootFiles = [
    'package.json',
    'server.ts',
    'tsconfig.json',
    'vite.config.ts',
    'eslint.config.js',
    'index.html',
    'firestore.rules',
    'firebase-blueprint.json',
    'firebase-applet-config.json',
    'metadata.json',
    'security_spec.md',
    '.env.example',
    '.gitignore',
  ];
  const includeDirs = ['src', 'public'];
  const excludedSubdirs = new Set(['node_modules', 'dist', 'dev-dist', '.git', '.aistudio', 'workspace']);

  const files: Array<{ relPath: string; content: Buffer; mtime: Date }> = [];

  for (const rel of includeRootFiles) {
    const abs = path.join(rootDir, rel);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      const st = fs.statSync(abs);
      files.push({ relPath: rel, content: fs.readFileSync(abs), mtime: st.mtime });
    }
  }

  const walk = (dirAbs: string, dirRel: string) => {
    if (!fs.existsSync(dirAbs)) return;
    const entries = fs.readdirSync(dirAbs, { withFileTypes: true });
    for (const entry of entries) {
      if (excludedSubdirs.has(entry.name) || entry.name.startsWith('.env')) continue;
      if (dirRel === 'public/assets' && entry.name === 'aistudio') continue;
      const nextAbs = path.join(dirAbs, entry.name);
      const nextRel = `${dirRel}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(nextAbs, nextRel);
      } else if (entry.isFile()) {
        const st = fs.statSync(nextAbs);
        files.push({ relPath: nextRel, content: fs.readFileSync(nextAbs), mtime: st.mtime });
      }
    }
  };

  for (const dir of includeDirs) {
    walk(path.join(rootDir, dir), dir);
  }

  const localChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  let offset = 0;

  for (const f of files) {
    const nameBuf = Buffer.from(f.relPath.replace(/\\/g, '/'), 'utf8');
    const crc = zlib.crc32(f.content) >>> 0;
    const compressed = zlib.deflateRawSync(f.content);
    const dosTime =
      ((f.mtime.getHours() & 0x1f) << 11) |
      ((f.mtime.getMinutes() & 0x3f) << 5) |
      ((f.mtime.getSeconds() >> 1) & 0x1f);
    const dosDate =
      (((Math.max(1980, f.mtime.getFullYear()) - 1980) & 0x7f) << 9) |
      (((f.mtime.getMonth() + 1) & 0x0f) << 5) |
      (f.mtime.getDate() & 0x1f);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 flag
    localHeader.writeUInt16LE(8, 8); // DEFLATE
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(f.content.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localChunks.push(localHeader, nameBuf, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8); // UTF-8 flag
    centralHeader.writeUInt16LE(8, 10); // DEFLATE
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(f.content.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralChunks.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  const centralDir = Buffer.concat(centralChunks);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(files.length, 8);
  endRecord.writeUInt16LE(files.length, 10);
  endRecord.writeUInt32LE(centralDir.length, 12);
  endRecord.writeUInt32LE(offset, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...localChunks, centralDir, endRecord]);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '18mb' }));

  app.post('/api/passport/read-mrz', async (req, res) => {
    try {
      const ai = getGeminiClient();
      if (!ai) {
        res.status(500).json({
          error: 'GEMINI_API_KEY is not configured. Please add it in Settings > Secrets.',
          code: 'MISSING_API_KEY',
        });
        return;
      }

      const { imageBase64, mimeType } = req.body || {};
      if (!imageBase64 || typeof imageBase64 !== 'string') {
        res.status(400).json({
          error: 'Missing base64 image data.',
          code: 'INVALID_INPUT',
        });
        return;
      }

      const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
      const cleanMime = typeof mimeType === 'string' && allowedMimes.includes(mimeType) ? mimeType : 'image/jpeg';
      const cleanData = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

      const prompt = [
        'Analyze this passport bio-data page image and accurately extract the ICAO 9303 TD3 Machine Readable Zone (MRZ) and personal details.',
        'Rules:',
        '1. If a 2-line TD3 MRZ is visible at the bottom, transcribe mrzLine1 and mrzLine2 character-by-character in uppercase (replacing filler chevrons accurately with <, keeping 44 characters per line).',
        '2. Extract fullName in English uppercase (Given Names + Surname, without < fillers), and if Arabic full name is clearly printed on the passport bio-data page (such as Egyptian/Arab passports), put it in arabicName, otherwise leave arabicName empty.',
        '3. Extract passportNo accurately (uppercase alphanumeric), 3-letter ISO alpha-3 nationalityCode (e.g. EGY, SAU, IDN, PAK), 3-letter issuingCountryCode, gender ("male" or "female"), birthDate in YYYY-MM-DD, and passportExpiry in YYYY-MM-DD.',
        '4. If the image is rotated, read it accurately regardless of orientation.',
        '5. If no passport/MRZ can be detected, set detected to false and explain briefly in notes.',
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: cleanMime,
                data: cleanData,
              },
            },
            { text: prompt },
          ],
        },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              detected: { type: Type.BOOLEAN, description: 'Whether a passport bio page or MRZ was detected.' },
              mrzLine1: { type: Type.STRING, description: 'Exact first 44-char TD3 MRZ line, uppercase.' },
              mrzLine2: { type: Type.STRING, description: 'Exact second 44-char TD3 MRZ line, uppercase.' },
              fullName: { type: Type.STRING, description: 'Full English name as printed on passport (Given Names Surname).' },
              arabicName: { type: Type.STRING, description: 'Full Arabic name if printed on the passport page, else empty.' },
              passportNo: { type: Type.STRING, description: 'Passport number uppercase alphanumeric.' },
              nationalityCode: { type: Type.STRING, description: '3-letter ISO alpha-3 nationality code.' },
              issuingCountryCode: { type: Type.STRING, description: '3-letter ISO alpha-3 issuing state code.' },
              gender: { type: Type.STRING, description: 'Either "male" or "female".' },
              birthDate: { type: Type.STRING, description: 'Date of birth formatted as YYYY-MM-DD.' },
              passportExpiry: { type: Type.STRING, description: 'Passport expiry date formatted as YYYY-MM-DD.' },
              confidence: { type: Type.STRING, description: 'Extraction confidence: "high", "medium", or "low".' },
              notes: { type: Type.STRING, description: 'Brief reading notes or error description.' },
            },
            required: ['detected', 'mrzLine1', 'mrzLine2', 'fullName', 'passportNo', 'nationalityCode', 'gender', 'birthDate', 'passportExpiry', 'confidence'],
          },
        },
      });

      const rawText = (response.text ?? '{}').trim();
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        res.status(502).json({
          error: 'Failed to parse structured passport response from AI.',
          code: 'PARSE_ERROR',
          raw: rawText,
        });
        return;
      }

      res.json({ ok: true, data: parsed });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string; code?: string };
      let status = typeof e?.status === 'number' && e.status >= 400 && e.status < 600 ? e.status : 500;
      let cleanMsg = e?.message || 'Failed to read passport MRZ image.';
      let code = e?.code || 'GEMINI_ERROR';
      let retryAfterSeconds: number | undefined;

      // Parse structured Google API JSON message if present
      const jsonStart = cleanMsg.indexOf('{');
      if (jsonStart !== -1) {
        try {
          const parsedErr = JSON.parse(cleanMsg.slice(jsonStart)) as {
            error?: {
              code?: number;
              status?: string;
              message?: string;
              details?: Array<{ retryDelay?: string }>;
            };
          };
          if (parsedErr?.error) {
            if (typeof parsedErr.error.code === 'number') status = parsedErr.error.code;
            if (parsedErr.error.status) code = parsedErr.error.status;
            if (parsedErr.error.message) cleanMsg = parsedErr.error.message;
            const retryDetail = parsedErr.error.details?.find((d) => typeof d.retryDelay === 'string');
            if (retryDetail?.retryDelay) {
              const sec = Math.ceil(parseFloat(retryDetail.retryDelay));
              if (!Number.isNaN(sec) && sec > 0) retryAfterSeconds = sec;
            }
          }
        } catch {
          // Keep original cleanMsg if nested JSON cannot be parsed
        }
      }

      if (status === 429 && !retryAfterSeconds) {
        retryAfterSeconds = 8;
      }

      res.status(status).json({
        error: cleanMsg,
        code,
        retryAfterSeconds,
      });
    }
  });

  app.get('/api/project/download-zip', async (req, res) => {
    try {
      const authHeader = String(req.headers.authorization || '');
      const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      if (!idToken) {
        res.status(401).json({ error: 'Authentication required to download project archive.' });
        return;
      }

      const fbConfigPath = path.join(__dirname, 'firebase-applet-config.json');
      if (fs.existsSync(fbConfigPath)) {
        const fbConfig = JSON.parse(fs.readFileSync(fbConfigPath, 'utf8')) as { apiKey?: string };
        if (fbConfig.apiKey) {
          const verifyRes = await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(fbConfig.apiKey)}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ idToken }),
            }
          );
          if (!verifyRes.ok) {
            res.status(403).json({ error: 'Invalid session token.' });
            return;
          }
        }
      }

      const zipBuf = buildZipArchive(__dirname);
      const dateStr = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="BEST_UNITED_1448_Project_${dateStr}.zip"`);
      res.send(zipBuf);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to build project zip archive.';
      res.status(500).json({ error: msg });
    }
  });

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT} (${isProd ? 'production' : 'development'})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
