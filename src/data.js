// LeoLife – feste Spieldaten: Eigenschaften, Fähigkeiten, Erbanlagen, Schwierigkeitsgrade, Gebiete,
// Grafikstufen, Tierarten, Futterwerte, Sprachformen und Icons. Enthält keine Logik und keinen Zustand.
export const ATTR=[
  {k:'str',n:'Stärke',d:'+3 Schaden pro Rang'},
  {k:'spd',n:'Tempo',d:'Schneller laufen und sprinten'},
  {k:'sta',n:'Ausdauer',d:'+15 Ausdauer, schnellere Erholung'},
  {k:'vit',n:'Vitalität',d:'+15 Leben pro Rang'},
  {k:'cam',n:'Tarnung',d:'Tiere bemerken dich später'},
  {k:'sat',n:'Genügsamer Magen',d:'Länger satt: Hunger wächst pro Rang 5 % langsamer'}
];

export const ABIL=[
  {k:'amb',n:'Hinterhalt',d:'Mehr Bonusschaden auf ahnungslose Beute'},
  {k:'jmp',n:'Sprungkraft',d:'Weiterer Sprung, kürzere Abklingzeit'},
  {k:'roar',n:'Brüllen',d:'Verjagt Raubtiere, lässt Beute erstarren (R)'},
  {k:'nose',n:'Witterung',d:'Größere Reichweite der Spürkarte, Fährten bleiben länger sichtbar'},
  {k:'climb',n:'Klettern',d:'Auf Bäume flüchten (E), kostet viel Ausdauer. Höhere Ränge: günstiger, schneller hinauf, stärkerer Sprung vom Baum'},
  {k:'night',n:'Nachtsicht',d:'Nachts heller und weiter sehen'}
];

export const DIFF={easy:{n:'Leicht',dmg:0.6,hunger:0.7,sense:0.85,xpLoss:0,raid:1.5,perma:false,d:'Weniger Schaden, langsamerer Hunger, kein Erfahrungsverlust beim Tod.'},
  normal:{n:'Normal',dmg:1,hunger:1,sense:1,xpLoss:0.4,raid:1,perma:false,d:'Das ausgewogene Spiel.'},
  hard:{n:'Schwer',dmg:1.35,hunger:1.3,sense:1.15,xpLoss:0.6,raid:0.75,perma:true,d:'Mehr Schaden, schnellerer Hunger, wachsamere Tiere. Stirbst du ohne Nachwuchs, endet deine Blutlinie endgültig.'}};

export const TRAITS={flink:['Flinke Läufe','+10 % Tempo'],zaeh:['Zähes Fell','+20 % Leben'],dunkel:['Dunkles Fell','Tiere bemerken dich später'],kiefer:['Starker Kiefer','+15 % Schaden'],
  lunge:['Große Lunge','+25 % Ausdauer'],nase:['Feine Nase','Spürkarte reicht weiter'],genug:['Genügsam','Hunger und Durst wachsen langsamer'],lang:['Langlebig','5 Minuten längeres Leben']};

export const REGIONS={
  savanne:{n:'Savanne',gen:1,d:'Offenes Grasland mit Wasserlöchern, Akazien und Herden. In einigen Wasserlöchern lauern Krokodile.',boss:'Riesenantilope',
    ponds:[[-52,38,15],[92,-78,19],[-118,-128,23],[60,150,18]],trees:330,savFrom:115,baobabs:3,palms:[3,5],patches:95,ground:[0x3c7a38,0xbfa95c],hor:0xcfe2d4,counts:null,
    winT:'König der Wildnis',winX:'Du hast die Riesenantilope erlegt. Aus dem kleinen Jungtier ist der gefürchtetste Jäger der Savanne geworden.'},
  sumpf:{n:'Sumpf',gen:3,d:'Viele Wasserlöcher, Schilf und Palmen. Krokodile lauern unsichtbar im Wasser – nur Luftblasen verraten sie.',boss:'Riesenkrokodil',
    ponds:[[-60,30,18],[-20,-70,16],[55,-40,20],[80,60,22],[-110,-40,24],[20,110,19],[-90,120,21],[140,-10,23],[110,-130,20],[-40,-150,22],[-160,70,18],[170,110,17],[-150,-130,19]],
    trees:300,savFrom:999,palms:[4,7],patches:120,kopjes:2,riverZ:330,ground:[0x335a2a,0x5d6a36],hor:0xbfd3c2,
    counts:{maus:14,hase:8,capy:18,boar:9,deer:8,anti:0,giant:0,jack:3,hyena:4,lion:2,croc:10,bigcroc:1},
    winT:'Herr des Sumpfes',winX:'Du hast das Riesenkrokodil bezwungen. Kein Wasserloch ist vor deiner Linie mehr sicher.'},
  dschungel:{n:'Dschungel',gen:5,soon:true,d:'Paviane, Giftschlangen und Affen in den Bäumen.'},
  wueste:{n:'Wüste',gen:7,soon:true,d:'Hitze, kaum Deckung, Strauße und Oryx-Antilopen.'}
};

export const QUAL={
  low:{n:'niedrig',px:1,sh:0,shR:55,grass:3500,gS:80,tall:0.45,fog:[45,190],view:150},
  high:{n:'hoch',px:2,sh:2048,shR:55,grass:13000,gS:80,tall:1,fog:[55,240],view:170},
  ultra:{n:'ultra',px:2,sh:4096,shR:95,grass:30000,gS:125,tall:1,fog:[120,430],view:340}
};

export const SPECIES=[
 {id:'maus',n:'Maus',size:0.2,hp:4,spd:5,xp:5,sense:9,ring:[6,80],count:12,m:{col:0x9a8f84,col2:0xb5aa9f,ears:0.2,tail:0.9,len:1.1}},
 {id:'hase',n:'Hase',size:0.32,hp:10,spd:9,xp:12,sense:15,ring:[15,120],count:12,m:{col:0xb99772,col2:0xd6bfa0,ears:0.55,len:1.1,leg:0.45}},
 {id:'capy',n:'Wasserschwein',size:0.55,hp:32,spd:7,xp:32,sense:16,ring:[40,140],count:8,young:3,m:{col:0x8a633f,col2:0x76532f,len:1.5,hgt:0.7,wid:0.65,leg:0.4,ears:0.1}},
 {id:'wart',n:'Warzenschwein',size:0.62,hp:45,spd:9.5,xp:50,sense:17,ring:[50,200],count:5,young:3,burrow:1,m:{col:0x6e6258,col2:0x4e443c,len:1.3,hgt:0.6,wid:0.5,leg:0.4,head:0.5,ears:0.12,tusks:1,tail:0.45,tailTip:0x2a2420}},
 {id:'erdf',n:'Erdferkel',size:0.7,hp:55,spd:7,xp:65,sense:13,ring:[40,210],count:3,young:1,termite:1,m:{col:0xa08672,col2:0x8a6f5c,len:1.45,hgt:0.62,wid:0.5,leg:0.42,head:0.36,ears:0.42,snout:1,tail:0.75,tailTip:0x8f7563}},
 {id:'pango',n:'Schuppentier',size:0.45,hp:28,spd:3.2,xp:60,sense:9,ring:[40,210],count:3,termite:1,roll:1,m:{col:0x7d6346,col2:0x5f4a33,len:1.4,hgt:0.42,wid:0.44,leg:0.24,head:0.3,ears:0.04,tail:1.0,tailTip:0x5f4a33,spots:1,ball:0x6f5639}},
 {id:'baboon',n:'Pavian',size:0.72,hp:42,spd:9,xp:48,sense:26,ring:[60,195],count:6,young:4,fight:1,dmg:7,guard:1,baboon:1,troop:[5,7],m:{col:0x7a6a4c,col2:0x54473a,mane:0x9c9070}},
 {id:'boar',n:'Wildschwein',size:0.75,hp:75,spd:8.5,xp:70,sense:13,ring:[70,170],count:5,fight:1,dmg:8,young:3,guard:1,m:{col:0x4b3d33,col2:0x3a2f27,len:1.5,hgt:0.75,wid:0.6,leg:0.42,tusks:1,tail:0.3}},
 {id:'deer',n:'Gazelle',size:1.0,hp:115,spd:12,xp:120,sense:24,ring:[90,200],count:7,young:3,guard:1,gdmg:10,m:{hoof:'deer',col:0xa8743f,col2:0x8c5e30,leg:0.95,neck:0.35,horns:0.6,stripe:0xe8d9bd,ears:0.2}},
 {id:'anti',n:'Antilope',size:1.15,hp:200,spd:13.5,xp:230,sense:27,ring:[130,225],count:7,young:3,guard:1,gdmg:14,m:{hoof:'anti',col:0xc9924f,col2:0xe9d2a8,leg:1.0,neck:0.4,horns:0.85,stripe:0x3b2a1c,ears:0.2,tail:0.4}},
 {id:'giant',n:'Riesenantilope',size:2.5,hp:700,spd:10.5,xp:1200,sense:22,ring:[185,228],count:2,fight:1,dmg:35,boss:1,m:{hoof:'giant',col:0xb08a5c,col2:0x7d6040,leg:1.0,neck:0.45,horns:1.1,hgt:0.75,wid:0.65,len:1.6,ears:0.22,tail:0.6,tailTip:0x2a1c10}},
 {id:'jack',n:'Schakal',size:0.62,hp:40,spd:8.6,xp:55,sense:30,ring:[60,140],count:3,hunt:4,fight:1,dmg:6,pred:1,m:{col:0xb58a4f,col2:0x8d8a80,ears:0.3,tail:0.7,leg:0.6}},
 {id:'hyena',n:'Hyäne',size:0.95,hp:125,spd:10,xp:160,sense:34,ring:[105,190],count:3,hunt:8,fight:1,dmg:14,pred:1,young:2,guard:1,m:{col:0x9c8a6a,col2:0x4a4036,ears:0.22,tail:0.4,leg:0.7,hgt:0.65,spots:1}},
 {id:'lion',n:'Löwe',size:1.35,hp:360,spd:11.5,xp:520,sense:38,ring:[150,225],count:2,hunt:12,fight:1,dmg:30,pred:1,young:1,guard:1,m:{col:0xcfa35a,col2:0xbf9350,mane:0x6e4420,tail:1.0,tailTip:0x4a2c12,leg:0.7,hgt:0.7,wid:0.6,len:1.6}},
 {id:'croc',n:'Krokodil',size:1.1,hp:260,spd:4.5,xp:280,sense:9,ring:[0,230],count:2,hunt:14,fight:1,dmg:26,pred:1,croc:1,m:{col:0x4d5a34,col2:0x6b7547,len:2.6,hgt:0.32,wid:0.75,leg:0.22,head:0.42,ears:0.02,tail:1.8,tailTip:0x3c4628,belly:0xbab47e,snout:1}},
 {id:'bigcroc',n:'Riesenkrokodil',size:2.0,hp:950,spd:4,xp:1500,sense:11,ring:[0,230],count:0,hunt:99,fight:1,dmg:45,pred:1,croc:1,boss:1,m:{col:0x3f4a2c,col2:0x5e6740,len:2.6,hgt:0.32,wid:0.75,leg:0.22,head:0.42,ears:0.02,tail:1.8,tailTip:0x323a22,belly:0xa39d6a,snout:1}},
 {id:'ele',n:'Elefant',size:2.2,hp:2600,spd:6.5,xp:1600,sense:22,ring:[80,225],count:5,young:2,fight:1,dmg:42,elephant:1,troop:[5,6],m:{col:0x837b74,col2:0x6a635d}},
 {id:'hippo',n:'Nilpferd',size:1.5,hp:1400,spd:6,xp:900,sense:14,ring:[0,230],count:3,young:1,fight:1,dmg:34,hippo:1,m:{col:0x6e5d60,col2:0x4e4244,belly:0xb88a86}},
 {id:'snake',n:'Puffotter',size:0.55,hp:22,spd:3.2,xp:45,sense:6,ring:[25,215],count:4,fight:1,dmg:7,snake:1,m:{col:0x8a7148,col2:0xd9c48e,tailTip:0x3b2c19,belly:0xe2d6b0}},
 {id:'gnu',n:'Gnu',size:1.1,hp:170,spd:12.5,xp:180,sense:22,ring:[0,0],count:0,m:{hoof:'gnu',col:0x5c5751,col2:0x3c3834,leg:1.0,neck:0.45,horns:0.55,stripe:0x2a2622,ears:0.2,tail:0.6}},
 {id:'rival',n:'Rivale',size:1.15,hp:320,spd:11,xp:600,sense:30,ring:[0,0],count:0,pred:1,fight:1,hunt:99,dmg:13,m:{leo:'adult',col:0xb98a3a,col2:0xe2c08a,len:1.5,hgt:0.5,wid:0.48,leg:0.5,head:0.46,ears:0.15,tail:1.1,tailTip:0x2a1c10,spots:1}},
 {id:'poacher',n:'Wilderer',size:1.4,hp:150,spd:5.5,xp:250,sense:40,ring:[0,0],count:0,human:1,dmg:22,m:null},
 {id:'mate',n:'Leopard',size:1.0,hp:999,spd:7,xp:0,sense:0,ring:[40,150],count:5,friend:1,m:{leo:'adult',col:0xe0a23c,col2:0xf0c98a,len:1.5,hgt:0.5,wid:0.48,leg:0.5,head:0.44,ears:0.15,tail:1.1,tailTip:0x2a1c10,spots:1}}
];

export const ICONS={
  // Eigenschaften
  str:'<path d="M5 19Q8 11 11 4M10 20Q13 12 16 5M15 20Q17 14 19 9"/>',
  spd:'<path d="M5 6l6 6-6 6M12 6l6 6-6 6"/>',
  sta:'<path d="M3 9h11a3 3 0 1 0-3-3M3 15h14a3 3 0 1 1-3 3M3 12h8"/>',
  vit:'<path d="M12 20s-7-4.5-8.5-9A4.5 4.5 0 0 1 12 6.5 4.5 4.5 0 0 1 20.5 11C19 15.5 12 20 12 20z"/>',
  cam:'<path d="M5 20Q7 13 4 6M10 20Q11 11 14 4M15 20Q15.5 14 20 8M2 20.5h20"/>',
  sat:'<path d="M4 11h16a8 7 0 0 1-16 0z"/><path d="M12 3c2.5 2.6 2.5 4.4 0 6-2.5-1.6-2.5-3.4 0-6z"/>',
  // Fähigkeiten
  amb:'<circle cx="12" cy="12" r="6.5"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>',
  jmp:'<path d="M3 19Q10 1 19 14"/><path d="M15.2 13.6l3.8.6.9-3.7"/><path d="M2 21h6"/>',
  roar:'<circle cx="5.5" cy="12" r="2" fill="currentColor"/><path d="M10 8a5 5 0 0 1 0 8M14 5a9 9 0 0 1 0 14M18 2.5a13 13 0 0 1 0 19"/>',
  nose:'<path d="M7 21c-2-3 2-5 0-8s2-5 0-8M12 21c-2-3 2-5 0-8s2-5 0-8M17 21c-2-3 2-5 0-8s2-5 0-8"/>',
  climb:'<path d="M6 13a4 4 0 0 1 1.5-7.6 5 5 0 0 1 9.2-.4A4 4 0 0 1 18.5 13z"/><path d="M13 13v8M13 17l2.5-2"/><path d="M5 21v-5M3.2 17.8L5 16l1.8 1.8"/>',
  night:'<path d="M19.5 14.5A7.5 7.5 0 1 1 9.5 4.5a6 6 0 0 0 10 10z"/><path d="M17 3.5v3M15.5 5h3"/>',
  // Erbanlagen
  flink:'<ellipse cx="14.5" cy="16.6" rx="3.4" ry="2.7"/><circle cx="10.6" cy="11.4" r="1.35" fill="currentColor"/><circle cx="13.1" cy="9.3" r="1.35" fill="currentColor"/><circle cx="16.1" cy="9.3" r="1.35" fill="currentColor"/><circle cx="18.5" cy="11.7" r="1.35" fill="currentColor"/><path d="M2 12.5h4M2.5 16.5h5M2 20.5h6"/>',
  zaeh:'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  dunkel:'<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor"/><circle cx="15.5" cy="9" r="1.2" fill="currentColor"/><circle cx="16" cy="14.5" r="1.4" fill="currentColor"/>',
  kiefer:'<path d="M3.5 5h17"/><path d="M8.5 5c0 6 1.6 10.5 3.5 15 1.9-4.5 3.5-9 3.5-15"/><path d="M4.5 5l1.2 3.4L7 5M17 5l1.3 3.4L19.5 5"/>',
  lunge:'<path d="M12 3v8"/><path d="M10.5 9C7 8 4 12 4 17c0 2 1.5 3 3.5 3s3-1 3-3V9zM13.5 9c3.5-1 6.5 3 6.5 8 0 2-1.5 3-3.5 3s-3-1-3-3V9z"/>',
  nase:'<circle cx="10" cy="10" r="6"/><path d="M14.5 14.5L20 20"/><path d="M8 10.5c.6-1.5 2.4-1.5 3 0"/>',
  genug:'<path d="M3 12h18a9 7 0 0 1-18 0z"/><path d="M9 9c0-2 2-2 2-4M13.5 9c0-2 2-2 2-4"/>',
  lang:'<path d="M7 3h10M7 21h10M8 3c0 6 8 6 8 9s-8 3-8 9M16 3c0 6-8 6-8 9s8 3 8 9"/><path d="M10 19h4" />',
  // Ahnenkraft
  anc:'<path d="M3 18h18M4.5 18L3 8l5 4 4-7 4 7 5-4-1.5 10"/><circle cx="12" cy="14" r="1.2" fill="currentColor"/>'
};

export const ICOL={a:'#f2b84b',b:'#8ad4ef',t:'#ff9ad0',anc:'#9be07f'};

export const ico=(k,c,sz)=>'<span class="ico" style="--ic:'+c+(sz?';--isz:'+sz+'px':'')+'"><svg viewBox="0 0 24 24" aria-hidden="true">'+(ICONS[k]||'')+'</svg></span>';

export const FOOD={gnu:9,rival:8,croc:8,bigcroc:25,hippo:30,ele:40,maus:1,hase:2,capy:4,boar:6,wart:4,erdf:4,pango:2,baboon:3,deer:8,anti:10,giant:20,jack:3,hyena:5,lion:8,snake:1};

export const DAT={poacher:'einem Wilderer',gnu:'einer Gnu-Herde',fire:'dem Feuer',rival:'einem rivalisierenden Leoparden',croc:'einem Krokodil',bigcroc:'einem Riesenkrokodil',hippo:'einem Nilpferd',ele:'einem Elefanten',lion:'einem Löwen',hyena:'einer Hyäne',jack:'einem Schakal',boar:'einem Wildschwein',wart:'einem Warzenschwein',baboon:'einem Pavian',snake:'einer Puffotter',deer:'einer Gazelle',anti:'einer Antilope',giant:'einer Riesenantilope'};

export const ART={croc:'ein',hase:'einen',maus:'eine',capy:'ein',boar:'ein',baboon:'einen',deer:'eine',anti:'eine',lion:'einen',hyena:'eine',jack:'einen'};
