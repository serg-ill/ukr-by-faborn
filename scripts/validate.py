#!/usr/bin/env python3
"""Validate the public index and package without network access."""
import argparse
import json
from pathlib import Path
import re
from urllib.parse import urlsplit
from build_catalog import media_url, VERSION, ROOT


def validate(root=ROOT):
    catalog = json.loads((root / 'data/catalog.json').read_text(encoding='utf-8'))
    assert catalog['schema'] == 1 and catalog['version'] == VERSION
    assert catalog['coverage'] == 'curated-beta'
    assert catalog['titles'], 'Empty catalog'
    title_ids, episode_ids, count = set(), set(), 0
    for title in catalog['titles']:
        assert title['id'] not in title_ids, 'Duplicate title'
        title_ids.add(title['id'])
        assert title['type'] in ('movie', 'tv') and title['title']
        assert title['releases']
        release_ids = set()
        for release in title['releases']:
            assert release['id'] not in release_ids
            release_ids.add(release['id'])
            assert release['source'] in ('uakino', 'kinoukr')
            assert urlsplit(release['sourcePage']).hostname == {'uakino': 'uakino.best', 'kinoukr': 'kinoukr.tv'}[release['source']]
            assert release['audioLanguage'] == 'uk' and release['audioEvidence']
            assert release['voice'] and release['episodes']
            numbers = set()
            for episode in release['episodes']:
                count += 1
                assert episode['id'] not in episode_ids, 'Duplicate episode ID'
                episode_ids.add(episode['id'])
                number = (episode['season'], episode['episode'])
                assert number not in numbers, 'Duplicate episode in release'
                numbers.add(number)
                if title['type'] == 'tv':
                    assert episode['season'] > 0 and episode['episode'] > 0
                assert episode['state'] in ('verified', 'stale', 'unavailable') and episode['updatedAt']
                assert media_url(episode['master']) and episode['cors'] == '*'
                assert episode['qualities'] and episode['variants']
                for quality, url in episode['qualities'].items():
                    assert re.fullmatch(r'(2160|1440|1080|720|480|360)p', quality)
                    assert media_url(url)
                for variant in episode['variants']:
                    assert episode['qualities'][variant['label']] == variant['url']
                    assert variant['width'] > 0 and variant['height'] > 0
                    if variant['label'] == '2160p':
                        assert variant['width'] >= 3840 or variant['height'] >= 2160, 'Unproven 4K label'
                assert all(media_url(s['url']) for s in episode['subtitles'])
    plugin = (root / 'ukr-by-faborn.js').read_text(encoding='utf-8')
    assert VERSION in plugin and 'Faborn' in plugin
    assert 'eval(' not in plugin and 'new Function' not in plugin
    for path in ['index.html', 'assets/icon.svg', '.github/workflows/pages.yml', 'README.md', 'lib/faborn-ui.js', 'lib/faborn-player.js', 'lib/faborn-comments.js', 'lib/faborn-hub.js', 'lib/faborn-screensaver.js', 'lib/faborn-skip.js', 'lib/STARFIELD-LICENSE', 'lib/SAVER-WARP-LICENSE', 'lib/SAVER-MATRIX-LICENSE']:
        assert (root / path).is_file(), 'Missing ' + path
    print('Validated: %d titles, %d indexed entries, %d unique episode IDs' % (len(title_ids), count, len(episode_ids)))
    return count


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=ROOT)
    validate(parser.parse_args().root)
