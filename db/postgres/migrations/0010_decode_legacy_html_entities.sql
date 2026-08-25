BEGIN;

UPDATE egs_game
SET gamename = replace(
  replace(
    replace(
      replace(
        replace(
          replace(
            replace(
              replace(
                replace(
                  replace(
                    replace(
                      replace(
                        replace(
                          replace(
                            replace(gamename, '&equiv;', '≡'),
                            '&hearts;', chr(9829)
                          ),
                          '&rsquo;', '’'
                        ),
                        '&rdquo;', '”'
                      ),
                      '&ldquo;', '“'
                    ),
                    '&acirc;', 'â'
                  ),
                  '&times;', '×'
                ),
                '&omega;', 'ω'
              ),
              '&eacute;', 'é'
            ),
            '&dagger;', '†'
          ),
          '&rarr;', '→'
        ),
        '&hellip;', '…'
      ),
      '&nbsp;', ' '
    ),
    '&quot;', '"'
  ),
  '&amp;', '&'
)
WHERE gamename LIKE '%&%;%';

UPDATE egs_game
SET brand_name = replace(
  replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
    replace(brand_name, '&equiv;', '≡'), '&hearts;', chr(9829)), '&rsquo;', '’'), '&rdquo;', '”'),
    '&ldquo;', '“'), '&acirc;', 'â'), '&times;', '×'), '&omega;', 'ω'), '&eacute;', 'é'),
    '&dagger;', '†'), '&rarr;', '→'), '&hellip;', '…'), '&nbsp;', ' '), '&quot;', '"'), '&amp;', '&')
WHERE brand_name LIKE '%&%;%';

UPDATE alicenet_stock
SET egs_title = replace(
  replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
    replace(egs_title, '&equiv;', '≡'), '&hearts;', chr(9829)), '&rsquo;', '’'), '&rdquo;', '”'),
    '&ldquo;', '“'), '&acirc;', 'â'), '&times;', '×'), '&omega;', 'ω'), '&eacute;', 'é'),
    '&dagger;', '†'), '&rarr;', '→'), '&hellip;', '…'), '&nbsp;', ' '), '&quot;', '"'), '&amp;', '&')
WHERE egs_title LIKE '%&%;%';

UPDATE alicenet_stock
SET egs_brand = replace(
  replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
    replace(egs_brand, '&equiv;', '≡'), '&hearts;', chr(9829)), '&rsquo;', '’'), '&rdquo;', '”'),
    '&ldquo;', '“'), '&acirc;', 'â'), '&times;', '×'), '&omega;', 'ω'), '&eacute;', 'é'),
    '&dagger;', '†'), '&rarr;', '→'), '&hellip;', '…'), '&nbsp;', ' '), '&quot;', '"'), '&amp;', '&')
WHERE egs_brand LIKE '%&%;%';

COMMIT;
