'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PLUGIN = fs.readFileSync(path.join(__dirname, '..', 'prowlarr_category_fix.js'), 'utf8');
const PROWLARR = 'http://prowlarr.pve:9696';

function loadPlugin(storage = {}) {
    const listeners = {};
    const fields = Object.assign({
        parser_torrent_type: 'prowlarr',
        prowlarr_url: PROWLARR,
        prowlarr_url_two: ''
    }, storage);

    const Lampa = {
        Storage: {
            field: (name) => fields[name],
            get: (name, def) => (name in fields ? fields[name] : def)
        },
        Listener: {
            follow: (name, fn) => { (listeners[name] = listeners[name] || []).push(fn); },
            send: (name, event) => (listeners[name] || []).forEach((fn) => fn(event))
        },
        Activity: { active: () => null },
        SettingsApi: { addComponent() {}, addParam() {} },
        Manifest: {}
    };
    const window = { appready: true };
    const sandbox = { Lampa, window, console: { log() {}, error() {} } };

    vm.runInNewContext(PLUGIN, sandbox);

    return Lampa;
}

// card search as Lampa sends it: activity init, then the Prowlarr request
function cardSearch(Lampa, activity, results) {
    Lampa.Listener.send('activity', { component: 'torrents', type: 'init', object: activity });

    let received = null;
    const params = {
        url: PROWLARR + '/api/v1/search?apikey=k&query=' + encodeURIComponent(activity.search) +
            '&categories=5000&type=tvsearch',
        complite: (data) => { received = data; }
    };

    Lampa.Listener.send('request_before', { params });
    params.complite(results.map((title) => ({ title, protocol: 'torrent' })));

    return received.map((r) => r.title);
}

const SHOW = '12 12 12 / 12 12 12 [S01E01-02 of 08] (2026) WEB-DL 1080p | HDrezka Studio';
const JUNK = [
    'Мы все мертвы / Jigeum uri hakgyoneun (All of Us Are Dead), S1E1-12 of 12 (2022)',
    'Total War: Warhammer [v 1.6.0 + 12 DLC] (2016) PC | RePack от R.G. Механики',
    'Ёлки 12 (2025) WEB-DL 1080p'
];

test('card search keeps only releases containing the card title', () => {
    const Lampa = loadPlugin();
    const titles = cardSearch(Lampa, {
        search: '12 12 12', search_one: '12 12 12', search_two: '12 12 12'
    }, JUNK.concat([SHOW]));

    assert.deepStrictEqual(titles, [SHOW]);
});

test('original title, year in query and punctuation still match', () => {
    const Lampa = loadPlugin();
    const release = 'Ёлки-палки / Yolki.Palki.S01.2026.WEB-DL';
    const titles = cardSearch(Lampa, {
        search: 'Елки палки Yolki Palki 2026', search_one: 'Елки палки', search_two: 'Yolki Palki'
    }, [release, 'Ёлки 12 (2025) WEB-DL 1080p']);

    assert.deepStrictEqual(titles, [release]);
});

test('nothing matched: all results are kept', () => {
    const Lampa = loadPlugin();
    const titles = cardSearch(Lampa, {
        search: 'Двенадцать', search_one: 'Двенадцать', search_two: 'Twelve Twelve'
    }, JUNK);

    assert.deepStrictEqual(titles, JUNK);
});

test('clarification search compares with the typed text', () => {
    const Lampa = loadPlugin();
    const titles = cardSearch(Lampa, {
        search: 'Ёлки 12', search_one: '12 12 12', search_two: '12 12 12', clarification: true
    }, JUNK.concat([SHOW]));

    assert.deepStrictEqual(titles, ['Ёлки 12 (2025) WEB-DL 1080p']);
});

test('filter switched off keeps all results', () => {
    const Lampa = loadPlugin({ prowlarr_category_fix_title_filter: 'off' });
    const titles = cardSearch(Lampa, {
        search: '12 12 12', search_one: '12 12 12', search_two: '12 12 12'
    }, JUNK.concat([SHOW]));

    assert.deepStrictEqual(titles, JUNK.concat([SHOW]));
});
