/**
 * lampa-prowlarr-category-fix plugin v1.1.0
 * Keeps category-less indexers such as RuTor in Prowlarr search results
 * and hides results whose title does not contain the searched title.
 */

(function () {
    'use strict';

    var COMPONENT = 'prowlarr_category_fix';
    var MODE_FIELD = COMPONENT + '_mode';
    var TITLE_FILTER_FIELD = COMPONENT + '_title_filter';
    var MINIMUM_TIMEOUT = 1000 * 30;
    var SETTINGS_ICON = [
        '<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">',
        '<circle cx="16" cy="16" r="10" stroke="white" stroke-width="3"/>',
        '<path d="M23.5 23.5L32 32" stroke="white" stroke-width="3" stroke-linecap="round"/>',
        '<path d="M10 16H22M16 10V22" stroke="white" stroke-width="2" stroke-linecap="round"/>',
        '</svg>'
    ].join('');

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

    // the latest torrents activity: its search_one and search_two are the
    // card titles, Lampa sends it before the component starts the request
    var torrentsActivity = null;

    function rememberActivity(event) {
        if (event && event.type === 'init' && event.component === 'torrents') {
            torrentsActivity = event.object || null;
        }
    }

    function getQueryParameter(url, parameterName) {
        var match = url.match(new RegExp('[?&]' + parameterName + '=([^&#]*)'));
        if (!match) return '';

        try {
            return decodeURIComponent(match[1].replace(/\+/g, ' '));
        } catch (error) {
            return match[1];
        }
    }

    // lower case, "ё" as "е", punctuation as spaces; letters of any script stay
    function normalizeTitle(text) {
        return ' ' + String(text || '')
            .toLowerCase()
            .replace(/ё/g, 'е')
            .replace(/[\s.,:;!?'"`«»()[\]{}\/\\|_+*&#@%^~<>=\-]+/g, ' ')
            .trim() + ' ';
    }

    function searchPhrases(query) {
        var texts = [query, query.replace(/\s+(19|20)\d\d$/, '')];
        var activity = torrentsActivity;

        if (activity && activity.search === query && !activity.clarification) {
            texts.push(activity.search_one, activity.search_two);
        }

        return texts
            .map(normalizeTitle)
            .filter(function (phrase, index, all) {
                return phrase.trim() && all.indexOf(phrase) === index;
            });
    }

    function filterByTitle(results, phrases) {
        if (!Array.isArray(results) || !phrases.length) return results;

        var matched = results.filter(function (result) {
            var title = normalizeTitle(result && result.title);

            return phrases.some(function (phrase) {
                return title.indexOf(phrase) >= 0;
            });
        });

        // a different spelling on the tracker must not empty the list
        return matched.length ? matched : results;
    }

    function addTitleFilter(params) {
        if (Lampa.Storage.get(TITLE_FILTER_FIELD, 'on') === 'off') return;
        if (typeof params.complite !== 'function') return;

        var phrases = searchPhrases(getQueryParameter(params.url, 'query'));
        if (!phrases.length) return;

        var complite = params.complite;

        params.complite = function (data) {
            var filtered = data;

            try {
                filtered = filterByTitle(data, phrases);
            } catch (error) {
                console.error(
                    'Prowlarr Category Fix',
                    'Could not filter results:',
                    error && error.message ? error.message : error
                );
            }

            return complite.call(this, filtered);
        };
    }

    function interceptRequest(event) {
        try {
            if (!event || !event.params || typeof event.params.url !== 'string') return;
            if (Lampa.Storage.field('parser_torrent_type') !== 'prowlarr') return;
            if (!isConfiguredProwlarrSearch(event.params.url)) return;

            addTitleFilter(event.params);

            var mode = Lampa.Storage.get(MODE_FIELD, 'always');
            if (mode === 'off') return;
            if (mode === 'global' && !isGlobalSearch()) return;

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
            icon: SETTINGS_ICON,
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

        Lampa.SettingsApi.addParam({
            component: manifest.component,
            param: {
                name: TITLE_FILTER_FIELD,
                type: 'select',
                default: 'on',
                values: {
                    on: 'Включено',
                    off: 'Выключено'
                }
            },
            field: {
                name: 'Фильтр по названию',
                description: 'Скрывает раздачи, в заголовке которых нет названия из карточки или текста поиска. Если не совпало ничего, показывает всё.'
            }
        });
    }

    function startPlugin() {
        if (window.prowlarrCategoryFixStarted) return;
        window.prowlarrCategoryFixStarted = true;

        var manifest = {
            type: 'other',
            version: '1.1.0',
            name: 'Prowlarr Category Fix',
            description: 'Возвращает результаты RuTor и убирает лишние раздачи в поиске через Prowlarr.',
            component: COMPONENT
        };

        Lampa.Manifest.plugins = manifest;
        Lampa.Listener.follow('activity', rememberActivity);
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
