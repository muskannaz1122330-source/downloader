import express from 'express';
import { sendSuccess } from '../utils/errors.js';
import {
  getFixtureSession,
  serveFixtureMp4,
  serveFixtureTs,
} from '../services/offlineFixtures.js';

/** Mounted ONLY when ULTRA_FIXTURES=1 (never in production). */
export const fixtureRouter = express.Router();

fixtureRouter.get('/session', (_req, res) => sendSuccess(res, getFixtureSession()));
fixtureRouter.get('/health', (_req, res) =>
  sendSuccess(res, { fixtureMode: true, liveNetworkRequired: false })
);
fixtureRouter.get('/media.mp4', (req, res) => serveFixtureMp4(req, res, 'Fixture_Media.mp4'));
fixtureRouter.get('/media.ts', (req, res) => serveFixtureTs(req, res, 'Fixture_Media.ts'));
