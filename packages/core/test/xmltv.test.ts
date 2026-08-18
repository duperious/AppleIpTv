import { describe, expect, it } from 'vitest';
import { buildNameToIdMap, indexPrograms, parseXmltv, parseXmltvTime, programAt, upcoming } from '../src/parsers/xmltv.js';

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <channel id="trt1.tr"><display-name>TRT 1</display-name><icon src="http://logo/trt1.png"/></channel>
  <channel id="beinsports1.tr"><display-name>beIN Sports 1 HD</display-name></channel>
  <programme start="20250101090000 +0300" stop="20250101100000 +0300" channel="trt1.tr">
    <title>Sabah Haberleri</title><desc>G&#252;nl&#252;k b&#252;lten</desc><category>Haber</category>
  </programme>
  <programme start="20250101100000 +0300" stop="20250101113000 +0300" channel="trt1.tr">
    <title><![CDATA[Belgesel & Doga]]></title>
  </programme>
</tv>`;

describe('parseXmltvTime', () => {
  it('saat dilimli ve dilimsiz damgalari cozer', () => {
    expect(parseXmltvTime('20250101090000 +0300')).toBe(Date.UTC(2025, 0, 1, 6, 0, 0));
    expect(parseXmltvTime('20250101090000')).toBe(Date.UTC(2025, 0, 1, 9, 0, 0));
    expect(parseXmltvTime('bozuk')).toBeNaN();
  });
});

describe('parseXmltv', () => {
  const result = parseXmltv(XML, { minStop: 0, maxStart: Number.MAX_SAFE_INTEGER });

  it('kanallari okur', () => {
    expect(result.channels).toHaveLength(2);
    expect(result.channels[0]!.displayNames).toEqual(['TRT 1']);
    expect(result.channels[0]!.icon).toBe('http://logo/trt1.png');
  });

  it('programlari okur, varliklari ve CDATA icerigini cozer', () => {
    expect(result.programs).toHaveLength(2);
    expect(result.programs[0]!.description).toBe('Günlük bülten');
    expect(result.programs[1]!.title).toBe('Belgesel & Doga');
  });

  it('zaman penceresi disindaki programlari eler', () => {
    const filtered = parseXmltv(XML, { minStop: Date.UTC(2030, 0, 1) });
    expect(filtered.programs).toHaveLength(0);
  });

  it('istenmeyen kanallari atlar', () => {
    const filtered = parseXmltv(XML, { keepChannelIds: new Set(['baska.tr']), minStop: 0, maxStart: Number.MAX_SAFE_INTEGER });
    expect(filtered.programs).toHaveLength(0);
  });
});

describe('EPG dizini', () => {
  const { programs, channels } = parseXmltv(XML, { minStop: 0, maxStart: Number.MAX_SAFE_INTEGER });
  const index = indexPrograms(programs);

  it('belirli bir andaki programi bulur', () => {
    const at = Date.UTC(2025, 0, 1, 6, 30);
    expect(programAt(index, 'trt1.tr', at)?.title).toBe('Sabah Haberleri');
    expect(programAt(index, 'trt1.tr', Date.UTC(2025, 0, 1, 20, 0))).toBeUndefined();
  });

  it('sonraki programlari listeler', () => {
    const at = Date.UTC(2025, 0, 1, 6, 30);
    expect(upcoming(index, 'trt1.tr', at, 5)).toHaveLength(2);
  });

  it('ad tabanli kanal eslestirmesi kurar', () => {
    const map = buildNameToIdMap(channels);
    expect(map.get('bein sports 1')).toBe('beinsports1.tr');
    expect(map.get('trt 1')).toBe('trt1.tr');
  });
});
