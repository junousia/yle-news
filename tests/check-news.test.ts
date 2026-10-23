import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanText, applyFilters, NewsItem, Config, filters } from '../src/check-news';

describe('check-news core logic', () => {
  describe('cleanText()', () => {
    it('should remove HTML tags', () => {
      expect(cleanText('<p>Hello <b>World</b></p>')).toBe('Hello World');
      expect(cleanText('<a href="https://example.com">Link</a>')).toBe('Link');
    });

    it('should unescape common HTML entities', () => {
      expect(cleanText('&lt;div&gt;test&lt;/div&gt;')).toBe('<div>test</div>');
      expect(cleanText('Cost &euro;100 &amp; changing')).toBe('Cost €100 & changing');
      expect(cleanText('Quotes &quot;hello&quot; and &#39;world&#39;')).toBe(`Quotes "hello" and 'world'`);
    });

    it('should handle empty or null input safely', () => {
      expect(cleanText('')).toBe('');
      expect(cleanText(null as any)).toBe('');
    });
  });

  describe('applyFilters()', () => {
    const mockConfig: Config = {
      feeds: { 'Talous': 'url1', 'Urheilu': 'url2', 'Politiikka': 'url3' },
      disabledFeeds: ['Urheilu'],
      stateFile: 'dummy.db',
      notifyOnNew: false,
      watchlist: [],
      importantCategories: [],
      skipCategories: [],
      retentionDays: 90
    };

    const mockItems: NewsItem[] = [
      {
        id: '1', title: 'Talousuutinen', description: 'desc', link: 'link1', pubDate: 'date',
        author: 'author', categories: 'talous, raha', publisher: 'Yle', foundAt: 'date', feedCategory: 'Talous'
      },
      {
        id: '2', title: 'Urheiluuutinen', description: 'desc', link: 'link2', pubDate: 'date',
        author: 'author', categories: 'urheilu, jääkiekko', publisher: 'Yle Urheilu', foundAt: 'date', feedCategory: 'Urheilu'
      },
      {
        id: '3', title: 'Politiikkauutinen', description: 'desc', link: 'link3', pubDate: 'date',
        author: 'author', categories: 'politiikka', publisher: 'Yle', foundAt: 'date', feedCategory: 'Politiikka'
      }
    ];

    it('should filter out items from disabled feeds by default', () => {
      const result = applyFilters(mockItems, mockConfig);
      expect(result.length).toBe(2);
      expect(result.map(i => i.id)).toEqual(['1', '3']);
    });

    it('should override disabled feeds if a category filter is actively provided', () => {
      // Actively requesting 'Urheilu' overrides the disabledFeeds rule
      const result = applyFilters(mockItems, mockConfig, 'urheilu');
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('2');
    });

    it('should filter by publisher if publisher override is provided', () => {
      const result = applyFilters(mockItems, mockConfig, undefined, 'yle urheilu');
      // Publisher override should work, but wait: if we don't provide a category override, 
      // the default disabled feeds rule STILL applies and Urheilu feed is disabled. 
      // So if publisher is 'Yle Urheilu' but the item's feed is disabled, it should be hidden
      expect(result.length).toBe(0);
      
      // Let's enable the feed and check publisher filter
      const configEnabled = { ...mockConfig, disabledFeeds: [] };
      const result2 = applyFilters(mockItems, configEnabled, undefined, 'yle urheilu');
      expect(result2.length).toBe(1);
      expect(result2[0].id).toBe('2');
    });
  });
});
