/**
 * lampa-prowlarr-category-fix plugin v1.0.1
 * Keeps category-less indexers such as RuTor in Prowlarr search results.
 */

(function () {
    'use strict';

    var COMPONENT = 'prowlarr_category_fix';
    var MODE_FIELD = COMPONENT + '_mode';
    var MINIMUM_TIMEOUT = 1000 * 30;

    function removeQueryParameter(url, parameterName) {
        var hash = '';
        var hashIndex = url.indexOf('#');

        if (hashIndex >= 0) {
            hash = url.slice(hashIndex);
            url = url.slice(0, hashIndex);
        }

        var queryIndex = url.indexOf('?');
        if (queryIndex < 0) return url + hash;

        var base = url.slice(0, queryIndex);
        var query = url.slice(queryIndex + 1);
        var expectedName = parameterName.toLowerCase();
        var filtered = query.split('&').filter(function (part) {
            if (!part) return false;

            var encodedName = part.split('=', 1)[0].replace(/\+/g, ' ');
            var name;

            try {
                name = decodeURIComponent(encodedName).toLowerCase();
            } catch (error) {
                name = encodedName.toLowerCase();
            }

            return name !== expectedName;
        });

        return base + (filtered.length ? '?' + filtered.join('&') : '') + hash;
    }

    function normalizeBaseUrl(url) {
        return String(url || '').replace(/\/+$/, '');
    }

    function isConfiguredProwlarrSearch(url) {
        var configuredUrls = [
            Lampa.Storage.field('prowlarr_url'),
            Lampa.Storage.field('prowlarr_url_two')
        ];

        return configuredUrls.some(function (configuredUrl) {
            var baseUrl = normalizeBaseUrl(configuredUrl);

            return baseUrl && url.indexOf(baseUrl + '/api/v1/search') === 0;
        });
    }

    function isGlobalSearch() {
        var activity = Lampa.Activity && Lampa.Activity.active
            ? Lampa.Activity.active()
            : null;

        return Boolean(activity && activity.global);
    }

    function interceptRequest(event) {
        try {
            if (!event || !event.params || typeof event.params.url !== 'string') return;
            if (Lampa.Storage.field('parser_torrent_type') !== 'prowlarr') return;

            var mode = Lampa.Storage.get(MODE_FIELD, 'always');
            if (mode === 'off') return;
            if (mode === 'global' && !isGlobalSearch()) return;
            if (!isConfiguredProwlarrSearch(event.params.url)) return;

            var fixedUrl = removeQueryParameter(event.params.url, 'categories');
            if (fixedUrl === event.params.url) return;

            event.params.url = fixedUrl;

            // Category-less searches query more indexers and can exceed
            // Lampa's default 15 second parser timeout.
            event.params.timeout = Math.max(
                Number(event.params.timeout) || 0,
                MINIMUM_TIMEOUT
            );

            // Do not log the full URL: it contains the Prowlarr API key.
            console.log(
                'Prowlarr Category Fix',
                'Removed categories; request timeout is at least 30 seconds'
            );
        } catch (error) {
            // A compatibility issue in the plugin must not break the original
            // Prowlarr request.
            console.error(
                'Prowlarr Category Fix',
                'Could not process request:',
                error && error.message ? error.message : error
            );
        }
    }

    function addSettings(manifest) {
        Lampa.SettingsApi.addComponent({
            component: manifest.component,
            name: manifest.name
        });

        Lampa.SettingsApi.addParam({
            component: manifest.component,
            param: {
                name: MODE_FIELD,
                type: 'select',
                default: 'always',
                values: {
                    always: 'Во всех запросах',
                    global: 'Только в глобальном поиске',
                    off: 'Выключено'
                }
            },
            field: {
                name: 'Удалять категории из запросов',
                description: 'Позволяет Prowlarr возвращать результаты RuTor, помеченные категорией Other.'
            }
        });
    }

    function startPlugin() {
        if (window.prowlarrCategoryFixStarted) return;
        window.prowlarrCategoryFixStarted = true;

        var manifest = {
            type: 'other',
            version: '1.0.1',
            name: 'Prowlarr Category Fix',
            description: 'Возвращает результаты RuTor в поиске через Prowlarr.',
            component: COMPONENT
        };

        Lampa.Manifest.plugins = manifest;
        Lampa.Listener.follow('request_before', interceptRequest);
        addSettings(manifest);

        console.log('Prowlarr Category Fix', 'Plugin started');
    }

    if (window.appready) {
        startPlugin();
    } else {
        Lampa.Listener.follow('app', function (event) {
            if (event.type === 'ready') startPlugin();
        });
    }
})();
