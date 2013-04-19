/*
 * Copyright (c) 2003-2009 Pavel Rychly
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; version 2
 * dated June, 1991.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.

 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 */

function normalize_element(id) {
  text = document.getElementById(id).innerHTML;
  return text.replace("<B>", "<b>").replace("</B>", "</b>").replace(/===NONE===/g, "");
}

function replace_tags(id, tag) {
  if (document.getElementById(id) == null) return '';
  text = document.getElementById(id).innerHTML;
  return text.replace("<B>", "<" + tag + ">").replace("</B>", "</" + tag + ">").replace("<b>", "<" + tag + ">").replace("</b>", "</" + tag + ">").replace(/===NONE===/g, "");
}

function remove_tags(id) {
  if (document.getElementById(id) == null) return '';
  text = document.getElementById(id).innerHTML;
  return text.replace("<B>", "").replace("</B>", "").replace("<b>", "").replace("</b>", "").replace(/===NONE===/g, "");
}

function gen_xml(id, template) {
  if (template == 'ANW_INL') xml = conc_anw_inl(id);
  else if (template == 'cupclc') xml = conc_cup(id, 6);
  else if (template == 'cupcic') xml = conc_cup(id, 5);
  else if (template == 'cupcsc') xml = conc_cup(id, 4);
  else if (template == 'cupcac') xml = conc_cup(id, 5);
  else if (template == 'fidaplus_slovene')
    xml = replace_tags('sent' + id, 'i') + '\n';
  else if (template == 'oec_oup_all') xml = conc_oec_oup_all(id);
  else xml = normalize_element('sent' + id) + '\n';
  return xml;
}

function conc_cup(id, num) {
  xml = remove_tags('sent' + id).replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  xml += ' (';
  for (j=0; j<num; j++) xml += remove_tags('ref' + id + '-' + j) + '; '
  xml += remove_tags('ref' + id + '-' + num) + ')\n';
  return xml;
}

function conc_anw_inl(id) {
  xml = '<Voorbeeld>\n'
      + '  <tekst>' + remove_tags('sent' + id) + '</tekst>\n'
      + '  <id>' + remove_tags('ref' + id + '-0') + '</id>\n'
      + '  <bronentitel>' + remove_tags('ref' + id + '-1') + '</bronentitel>\n'
      + '  <datering>' + remove_tags('ref' + id + '-2') + '</datering>\n'
      + '  <variant>' + remove_tags('ref' + id + '-3') + '</variant>\n'
      + '  <auteur>' + remove_tags('ref' + id + '-4') + '</auteur>\n'
      + '  <url>' + remove_tags('ref' + id + '-5') + '</url>\n'
      + '</Voorbeeld>\n';
  return xml
}

function conc_oec_oup_all(id) {
  xml = 'sentence=' + normalize_element('sent' + id) + '\n'
      + remove_tags('ref' + id + '-0') + '\n'
      + remove_tags('ref' + id + '-1') + '\n'
      + remove_tags('ref' + id + '-2') + '\n'
      + remove_tags('ref' + id + '-3') + '\n'
      + remove_tags('ref' + id + '-4') + '\n'
      + remove_tags('ref' + id + '-5') + '\n'
      + remove_tags('ref' + id + '-6') + '\n'
      + remove_tags('ref' + id + '-7') + '\n'
      + remove_tags('ref' + id + '-8') + '\n'
      + remove_tags('ref' + id + '-9') + '\n\n';
  return xml;
}

// tickbox lexicography functions

function tblex2xml(template, lemma, gramrel) {
  xml = '';
  if (template == 'vanilla' || template == 'vanilla2') xml = vanilla(lemma, gramrel);
  else if (template == 'ukwac_mcd') xml = ukwac_mcd(lemma, gramrel);
  else if (template == 'oec_oup_shogakukan') xml = oec_oup_shogakukan();
  else if (template == 'ANW_INL') xml = anw_inl(lemma, gramrel);
  else if (template == 'fidaplus_slovene') xml = fidaplus_slovene(lemma, gramrel);
  else if (template == 'iztok_caja') xml = iztok_caja(lemma, gramrel);
  else if (template == 'cupclc') xml = cup(6);
  else if (template == 'cupcic') xml = cup(5);
  else if (template == 'cupcsc') xml = cup(4);
  else if (template == 'cupcac') xml = cup(5);
  else if (template == 'bnc_test') xml = bnc_test();
  else if (template == 'bnc-1m_neco_neco') xml = bnc_test();
  else if (template == 'oec_oup_all') xml = oec_oup_all();
  else { jQuery('#copy_note').text('ERROR'); }
  jQuery('#copy_note').text('XML copied');
  return xml;
}

function anw_inl(lemma, gramrel) {
  xml = '<keyword>' + lemma + '</keyword>\n<gramrel>\n  <grname>'
        + gramrel + '</grname>\n';
  curr_collo = '';
  i = 1;
  chbox = document.getElementById(i);
  while (chbox != null) {
    if (chbox.checked) { // costruction of xml
      if (curr_collo != chbox.name) {
        if (curr_collo != '') {
          xml = xml + '  </collocation>\n';
        }
        xml = xml + '  <collocation>\n    <collo>' + chbox.name
                  + '</collo>\n';
      }
      xml = xml + '    <Voorbeeld>\n'
                + '      <tekst>' + remove_tags('sent' + i) + '</tekst>\n'
                + '      <id>' + remove_tags('ref' + i + '-0')
                + '</id>\n'
                + '      <bronentitel>' + remove_tags('ref' + i + '-1')
                + '</bronentitel>\n'
                + '      <datering>' + remove_tags('ref' + i + '-2')
                + '</datering>\n'
                + '      <variant>' + remove_tags('ref' + i + '-3')
                + '</variant>\n'
                + '      <auteur>' + remove_tags('ref' + i + '-4')
                + '</auteur>\n'
                + '      <url>' + remove_tags('ref' + i + '-5') + '</url>\n'
                + '    </Voorbeeld>\n';
      curr_collo = chbox.name;
    }
    i++;
    chbox = document.getElementById(i);
  }
  if (curr_collo != '') {
    xml = xml + '  </collocation>\n';
  }
  xml = xml + '</gramrel>\n';
  return xml
}


function vanilla(lemma, gramrel) {
  xml = '<keyword>' + lemma + '</keyword>\n<gramrel>\n  <grname>'
        + gramrel + '</grname>\n';
  curr_collo = '';
  i = 1;
  chbox = document.getElementById(i);
  while (chbox != null) {
    if (chbox.checked) { // costruction of xml
      if (curr_collo != chbox.name) {
        if (curr_collo != '') {
          xml = xml + '  </collocation>\n';
        }
        xml = xml + '  <collocation>\n    <collo>' + chbox.name
                  + '</collo>\n';
      }
      xml = xml + '    <example>' + normalize_element('sent' + i)
                + '</example>\n';
      curr_collo = chbox.name;
    }
    i++;
    chbox = document.getElementById(i);
  }
  if (curr_collo != '') {
    xml = xml + '  </collocation>\n';
  }
  xml = xml + '</gramrel>\n';
  return xml
}


function iztok_caja(lemma, gramrel) {
//  xml = '<keyword>' + lemma + '</keyword>\n<gramrel>\n  <grname>'
//        + gramrel + '</grname>\n';
  xml = '<Dictionary>\n  <Language>\n  <Headword HeadwordSign="' + lemma
        + '">\n  <gramrel grname="' + gramrel + '">\n';
  curr_collo = '';
  i = 1;
  chbox = document.getElementById(i);
  while (chbox != null) {
    if (chbox.checked) { // costruction of xml
      if (curr_collo != chbox.name) {
        if (curr_collo != '') {
          xml = xml + '  </collocation>\n';
        }
        xml = xml + '  <collocation collo="' + chbox.name + '">\n';
        index = 0;
      }
      index += 1;
      xml += '    <Example Example.number="';
      xml += index + '" Database.DomainLabel="';
      xml += remove_tags('ref' + i + '-0') + '" Example="';
      xml += remove_tags('sent' + i) + '" Source="';
      xml += remove_tags('ref' + i + '-1') + '" />\n';
      curr_collo = chbox.name;
    }
    i++;
    chbox = document.getElementById(i);
  }
  if (curr_collo != '') {
    xml = xml + '  </collocation>\n';
  }
  xml = xml + '  </gramrel>\n  </Headword>\n  </Language>\n</Dictionary>\n';
  return xml
}


function ukwac_mcd(lemma, gramrel) {
  xml = '<keyword>' + lemma + '</keyword>\n<gramrel>\n  <grname>'
        + gramrel + '</grname>\n';
  curr_collo = '';
  i = 1;
  chbox = document.getElementById(i);
  while (chbox != null) {
    if (curr_collo != chbox.name) {
      if (curr_collo != '') {
        xml = xml + '  </collocation>\n';
      }
      xml = xml + '  <collocation>\n    <collo>' + chbox.name
                + '</collo>\n';
    }
    if (chbox.checked) {
      xml = xml + '    <example>' + normalize_element('sent' + i)
                + '</example>\n';
    }
    curr_collo = chbox.name;
    i++;
    chbox = document.getElementById(i);
  }
  if (curr_collo != '') {
    xml = xml + '  </collocation>\n';
  }
  xml = xml + '</gramrel>\n';
  return xml
}


function oec_oup_shogakukan() {
  xml = '';
  i = 1;
  chbox = document.getElementById(i);
  while (chbox != null) {
    if (chbox.checked) { // costruction of xml
      xml += '<eg xmlns:e="urn:IDMEE" xmlns="urn:M-EN_US-MSDICT"><ex prov="'
      xml += remove_tags('ref' + i + '-0') + '" source="'
      xml += remove_tags('ref' + i + '-1') + '">'
      xml += remove_tags('sent' + i)
      xml += '</ex></eg>\n'
    }
    i++;
    chbox = document.getElementById(i);
  }
  return xml
}


function fidaplus_slovene() {
  xml = '';
  i = 1;
  chbox = document.getElementById(i);
  while (chbox != null) {
    if (chbox.checked) { // costruction of xml
      xml += '<zgled>'
      xml += replace_tags('sent' + i, 'i')
      xml += '</zgled>'
    }
    i++;
    chbox = document.getElementById(i);
  }
  return xml
}


function oec_oup_all() {
  xml = '';
  id = 1;
  chbox = document.getElementById(id);
  while (chbox != null) {
    if (chbox.checked) { // costruction of xml
      xml += 'sentence=' + normalize_element('sent' + id) + '\n'
          + remove_tags('ref' + id + '-0') + '\n'
          + remove_tags('ref' + id + '-1') + '\n'
          + remove_tags('ref' + id + '-2') + '\n'
          + remove_tags('ref' + id + '-3') + '\n'
          + remove_tags('ref' + id + '-4') + '\n'
          + remove_tags('ref' + id + '-5') + '\n'
          + remove_tags('ref' + id + '-6') + '\n'
          + remove_tags('ref' + id + '-7') + '\n'
          + remove_tags('ref' + id + '-8') + '\n'
          + remove_tags('ref' + id + '-9') + '\n\n';
    }
    id++;
    chbox = document.getElementById(id);
  }
  return xml;
}

function cup(num) {
  xml = '';
  i = 1;
  chbox = document.getElementById(i);
  while (chbox != null) {
    if (chbox.checked) { // costruction of xml
      xml += remove_tags('sent' + i).replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      xml += ' (';
      for (j=0; j<num; j++) xml += remove_tags('ref' + i + '-' + j) + '; ';
      xml += remove_tags('ref' + i + '-' + num) + ')\n';
    }
    i++;
    chbox = document.getElementById(i);
  }
  return xml;
}

function bnc_test() {
  xml = '';
  i = 1;
  chbox = document.getElementById(i);
  while (chbox != null) {
    if (chbox.checked) { // costruction of xml
      xml += '<eg xmlns:e="urn:IDMEE" xmlns="urn:M-EN_US-MSDICT"><ex prov="'
      xml += remove_tags('ref' + i + '-0') + '" source="'
      xml += remove_tags('ref' + i + '-1') + '">'
      xml += remove_tags('sent' + i)
      xml += '</ex></eg>\n'
    }
    i++;
    chbox = document.getElementById(i);
  }
  return xml
}
