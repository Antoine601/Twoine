/**
 * Ordre d'affichage et dossiers de l'interface.
 * Les éléments eux-mêmes restent dans leurs fichiers ; seul le rangement est ici.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { TOOL_CONFIG_PATH } from '../config/constants.js';

const LAYOUT_FILE = path.join(TOOL_CONFIG_PATH, 'layout.json');
const SCOPE_PATTERN = /^[a-zA-Z0-9:._-]{1,120}$/;

function emptyScope() {
    return { folders: [], placements: {} };
}

function loadAll() {
    try {
        if (!fs.existsSync(TOOL_CONFIG_PATH)) {
            fs.mkdirSync(TOOL_CONFIG_PATH, { recursive: true });
        }
        if (!fs.existsSync(LAYOUT_FILE)) {
            return { scopes: {} };
        }
        const data = JSON.parse(fs.readFileSync(LAYOUT_FILE, 'utf8'));
        if (!data || typeof data !== 'object' || !data.scopes || typeof data.scopes !== 'object') {
            return { scopes: {} };
        }
        return data;
    } catch {
        return { scopes: {} };
    }
}

function saveAll(data) {
    if (!fs.existsSync(TOOL_CONFIG_PATH)) {
        fs.mkdirSync(TOOL_CONFIG_PATH, { recursive: true });
    }
    fs.writeFileSync(LAYOUT_FILE, JSON.stringify(data, null, 2));
}

function assertScope(scope) {
    if (!SCOPE_PATTERN.test(scope || '')) {
        throw new Error('Périmètre de rangement invalide');
    }
}

export function getLayout(scope) {
    assertScope(scope);
    const all = loadAll();
    const stored = all.scopes[scope];
    if (!stored) return emptyScope();
    return {
        folders: Array.isArray(stored.folders) ? stored.folders : [],
        placements: stored.placements && typeof stored.placements === 'object' ? stored.placements : {}
    };
}

export function saveLayout(scope, body) {
    assertScope(scope);
    const rawFolders = Array.isArray(body?.folders) ? body.folders : [];
    const folders = [];
    const ids = new Set();

    for (const folder of rawFolders.slice(0, 200)) {
        const id = String(folder?.id || '').trim();
        if (!id || id.length > 80 || ids.has(id)) continue;
        ids.add(id);
        const name = String(folder?.name || 'Dossier').trim().slice(0, 80) || 'Dossier';
        folders.push({
            id,
            name,
            parentId: folder?.parentId ? String(folder.parentId) : null,
            order: Number.isFinite(Number(folder?.order)) ? Number(folder.order) : folders.length
        });
    }

    for (const folder of folders) {
        if (!folder.parentId || folder.parentId === folder.id || !ids.has(folder.parentId)) {
            folder.parentId = null;
        }
    }

    const placements = {};
    const rawPlacements = body?.placements && typeof body.placements === 'object' ? body.placements : {};
    for (const [itemId, placement] of Object.entries(rawPlacements).slice(0, 2000)) {
        if (!itemId || itemId.length > 200) continue;
        const folderId = placement?.folderId ? String(placement.folderId) : null;
        placements[itemId] = {
            folderId: folderId && ids.has(folderId) ? folderId : null,
            order: Number.isFinite(Number(placement?.order)) ? Number(placement.order) : 0
        };
    }

    const all = loadAll();
    all.scopes[scope] = { folders, placements };
    saveAll(all);
    return all.scopes[scope];
}

export function renameItem(scope, oldId, newId) {
    if (!oldId || !newId || oldId === newId) return;
    try {
        assertScope(scope);
    } catch {
        return;
    }
    const all = loadAll();
    const stored = all.scopes[scope];
    if (!stored?.placements?.[oldId]) return;
    stored.placements[newId] = stored.placements[oldId];
    delete stored.placements[oldId];
    saveAll(all);
}

export function renameScope(oldScope, newScope) {
    if (!oldScope || !newScope || oldScope === newScope) return;
    try {
        assertScope(oldScope);
        assertScope(newScope);
    } catch {
        return;
    }
    const all = loadAll();
    if (!all.scopes[oldScope]) return;
    all.scopes[newScope] = all.scopes[oldScope];
    delete all.scopes[oldScope];
    saveAll(all);
}

export function newFolderId() {
    return crypto.randomUUID();
}

export default { getLayout, saveLayout, renameItem, renameScope, newFolderId };
