import re, math, os, json
from collections import OrderedDict
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A2, landscape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor, Color
import fitz

ROOT='/mnt/data'
SQLPATH=ROOT+'/FoodBridge_3NF_Finalization/database/schema_3nf.sql'
OUTPUT=ROOT+'/FoodBridge_3NF_Finalization/diagrams'
os.makedirs(OUTPUT,exist_ok=True)
source=open(SQLPATH,encoding='utf-8').read()
# parse declared column identifiers directly from CREATE TABLE blocks
cols=OrderedDict(); primary={}; fk=[]; unique=[]
for match in re.finditer(r'CREATE TABLE\s+(\w+)\s*\((.*?)\n\);',source,re.S|re.I):
    tbl=match.group(1); body=match.group(2)
    table_cols=[]
    for line in body.splitlines():
        l=line.strip().rstrip(',')
        if not l or l.startswith('--'):continue
        if l.upper().startswith('CONSTRAINT'):
            fm=re.search(r'FOREIGN KEY\s*\((\w+)\)\s*REFERENCES\s*(\w+)\s*\((\w+)\)',l,re.I)
            if fm:fk.append((tbl,fm.group(1),fm.group(2),fm.group(3)))
            continue
        name=l.split()[0]
        table_cols.append(name)
        if re.search(r'\bPRIMARY KEY\b',l,re.I):primary[tbl]=name
        if re.search(r'\bUNIQUE\b',l,re.I):unique.append((tbl,name))
    cols[tbl]=table_cols

assert list(cols)==['organizations','users','donations','ngo_requests','allocations','pickups']
assert sum(len(v) for v in cols.values())==54,(sum(len(v) for v in cols.values()),cols)
assert len(fk)==6
expected_fk=[('users','org_id','organizations','org_id'),('donations','donor_org_id','organizations','org_id'),('ngo_requests','ngo_org_id','organizations','org_id'),('allocations','donation_id','donations','donation_id'),('allocations','request_id','ngo_requests','request_id'),('pickups','allocation_id','allocations','allocation_id')]
assert sorted(fk)==sorted(expected_fk),(fk,expected_fk)
assert ('pickups','allocation_id') in unique

# Embedded fonts
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
FONTB='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
if not os.path.exists(FONT):FONT='/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf'
if not os.path.exists(FONTB):FONTB='/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf'
pdfmetrics.registerFont(TTFont('Body',FONT));pdfmetrics.registerFont(TTFont('BodyBold',FONTB))
W,H=landscape(A2)
COL={
'ink':HexColor('#182336'), 'muted':HexColor('#4e6475'), 'green':HexColor('#d8f3d7'), 'greenstroke':HexColor('#207b43'),
'blue':HexColor('#d9e4ff'),'bluestroke':HexColor('#445b96'),'pink':HexColor('#fee1e8'),'pinkstroke':HexColor('#b65d74'),
'red':HexColor('#bd263e'),'line':HexColor('#3c5062'),'faint':HexColor('#e9eef3')
}

def txt(c,x,y,s,size=13,bold=False,align='center',color='ink'):
    c.setFillColor(COL[color] if isinstance(color,str) else color)
    c.setFont('BodyBold' if bold else 'Body',size)
    {'center':c.drawCentredString,'left':c.drawString,'right':c.drawRightString}[align](x,y,str(s))

def line(c,coords,col='line',width=1.1,dash=None):
    c.setStrokeColor(COL[col] if isinstance(col,str) else col)
    c.setLineWidth(width)
    c.setDash(dash or [])
    p=c.beginPath();p.moveTo(*coords[0]);
    for xy in coords[1:]:p.lineTo(*xy)
    c.drawPath(p)
    c.setDash([])

def header(c,section,subtitle=''):
    c.setFillColor(COL['ink'])
    txt(c,W/2,H-65,'Food Waste Redistribution and Resource Allocation System',27,True)
    txt(c,W/2,H-105,'Sruthi Vejju  |  PES1UG24CS472     •     Shubashitha Gowtham  |  PES1UG24CS450',17,True)
    txt(c,W/2,H-145,section,22,True)
    if subtitle:txt(c,W/2,H-175,subtitle,12,False,color='muted')
    line(c,[(45,H-194),(W-45,H-194)],'faint',2)

def box(c,cx,cy,label,w=230,h=56):
    c.setFillColor(COL['green']);c.setStrokeColor(COL['greenstroke']);c.setLineWidth(2.2)
    c.rect(cx-w/2,cy-h/2,w,h,fill=1,stroke=1)
    txt(c,cx,cy-7,label,19,True)

def diamond(c,cx,cy,lab,w=142,h=80):
    c.setFillColor(COL['blue']);c.setStrokeColor(COL['bluestroke']);c.setLineWidth(1.9)
    p=c.beginPath();p.moveTo(cx,cy+h/2);p.lineTo(cx+w/2,cy);p.lineTo(cx,cy-h/2);p.lineTo(cx-w/2,cy);p.close()
    c.drawPath(p,stroke=1,fill=1)
    lines=lab.split('\n')
    for j,x in enumerate(lines):txt(c,cx,cy+(len(lines)-1)*9-j*18-4,x,12.4,True)

def oval(c,cx,cy,label,ispk=False,w=214,h=27):
    c.setFillColor(COL['pink']);c.setStrokeColor(COL['pinkstroke']);c.setLineWidth(1.15)
    c.ellipse(cx-w/2,cy-h/2,cx+w/2,cy+h/2,fill=1,stroke=1)
    # auto-fit long attribute names
    fsize=12.1
    while pdfmetrics.stringWidth(label,'BodyBold' if ispk else 'Body',fsize)>w-20:fsize-=0.3
    txt(c,cx,cy-fsize*.33,label,fsize,ispk)
    if ispk:
        sw=pdfmetrics.stringWidth(label,'BodyBold',fsize)
        line(c,[(cx-sw/2,cy-8),(cx+sw/2,cy-8)],'ink',0.85)

def ellipse_bank(c,tbl,centerx,firsty,step,spinx,entityx,entityy,side):
    names=cols[tbl]
    ys=[firsty-i*step for i in range(len(names))]
    for attr,y in zip(names,ys):
        oval(c,centerx,y,attr,attr==primary[tbl])
        if side=='left':line(c,[(centerx+107,y),(spinx,y)],'muted',0.85)
        else:line(c,[(centerx-107,y),(spinx,y)],'muted',0.85)
    line(c,[(spinx,min(min(ys),entityy)),(spinx,max(max(ys),entityy))],'muted',0.85)
    line(c,[(spinx,entityy),(entityx,entityy)],'muted',0.85)

def relation(c,name,cx,cy,segments,left_label='',right_label='',card_coords=()):
    for seg in segments:line(c,seg,'line',1.7)
    diamond(c,cx,cy,name)
    for x,y,t in card_coords:txt(c,x,y,t,13,True,color='muted')

# ER precise placement manually; 55 ovals, all 6 PK, six matching relationships
ER=OUTPUT+'/ER_Diagram_Exact_3NF.pdf'
c=canvas.Canvas(ER,pagesize=(W,H),pageCompression=1)
c.setTitle('FoodBridge ER Diagram — exact PostgreSQL schema')
header(c,'ENTITY–RELATIONSHIP DIAGRAM  •  CHEN NOTATION','Pink ovals: attributes  |  Underlined: primary keys  |  Green rectangles: entities  |  Blue diamonds: relationships')
positions={'organizations':(465,900),'users':(1195,900),'donations':(465,628),'ngo_requests':(1195,628),'allocations':(840,335),'pickups':(840,122)}
# entity/relationship lines behind shapes
# org-users
line(c,[(580,900),(782,900)],width=1.8);line(c,[(898,900),(1080,900)],width=1.8)
# org-donations
line(c,[(465,872),(465,813)],width=1.8);line(c,[(465,750),(465,656)],width=1.8)
# org-requests: corner routes to diamond center near right
line(c,[(580,879),(648,879),(648,775),(913,775)],width=1.8)
line(c,[(1055,775),(1195,775),(1195,656)],width=1.8)
# donations-allocations, diagonal paths separate
line(c,[(580,618),(626,618),(626,488),(659,488)],width=1.8)
line(c,[(799,488),(799,397),(764,397),(764,335)],width=1.8)
# ngo-allocations
line(c,[(1080,618),(1042,618),(1042,488),(1027,488)],width=1.8)
line(c,[(885,488),(885,397),(912,397),(912,335)],width=1.8)
# allocation-pickup
line(c,[(840,307),(840,266)],width=1.8)
line(c,[(840,212),(840,150)],width=1.8)
# shapes
for t,(x,y) in positions.items():box(c,x,y,t.upper(),w=230 if t not in ('ngo_requests','organizations') else 256)
# diamonds
for x,y,name,w,h in [(840,900,'has',130,82),(465,781,'creates',140,75),(984,775,'raises',140,76),(729,488,'allocated\nthrough',140,83),(956,488,'fulfilled\nthrough',140,83),(840,239,'scheduled\nfor',140,60)]:diamond(c,x,y,name,w,h)
# cardinality numbers beside line endpoints, add 0..1 near pickup end
for x,y,t in [(630,916,'1'),(1040,916,'N'),(485,843,'1'),(485,686,'N'),(667,862,'1'),(1209,697,'N'),(600,639,'1'),(755,398,'N'),(1067,640,'1'),(931,398,'N'),(858,284,'1'),(860,162,'0..1')]:txt(c,x,y,t,13,True,color='muted')
# all attribute ellipses and connectors drawn above relation lines for clear grouping
ellipse_bank(c,'organizations',151,1014,26,323,337,900,'left')
ellipse_bank(c,'users',1528,1014,26,1372,1310,900,'right')
ellipse_bank(c,'donations',151,777,25.4,324,350,628,'left')
ellipse_bank(c,'ngo_requests',1528,777,25.5,1372,1323,628,'right')
ellipse_bank(c,'allocations',456,375,25.2,657,725,335,'left')
ellipse_bank(c,'pickups',1222,326,26,1060,955,122,'right')
# footnote
line(c,[(45,57),(W-45,57)],'faint',1.5)
txt(c,W/2,34,'Optional pickup: one allocation may have 0 or 1 pickup; each pickup references exactly one allocation (UNIQUE FK).',12,color='muted')
c.showPage();c.save()

# relational schema with 6 rows and exact field names (automated)
SC=OUTPUT+'/Relational_Schema_Exact_3NF.pdf'
c=canvas.Canvas(SC,pagesize=(W,H),pageCompression=1)
c.setTitle('FoodBridge Relational Schema — exact PostgreSQL SQL')
header(c,'RELATIONAL SCHEMA  •  THIRD NORMAL FORM (3NF)','Underlined cell = primary key   |   Red dashed cell = foreign key   |   Arrows: foreign key → referenced primary key')
# highlight 3NF "proposed" as it depends on functional dependencies in real world
row_y={'organizations':911,'users':768,'donations':625,'ngo_requests':482,'allocations':339,'pickups':196}
cellpos={}; rowout={}
for tb,yy in row_y.items():
    txt(c,115,yy+55,tb.upper(),18,True,align='left')
    x=115
    coords={}
    for name in cols[tb]:
        is_fk=any(t==tb and f==name for t,f,_,_ in fk)
        ispk=(name==primary[tb])
        tw=pdfmetrics.stringWidth(name,'BodyBold' if ispk else 'Body',14)
        width=max(62,tw+24)
        if name=='verification_status':width=max(width,176)
        c.setFillColor(HexColor('#fff1f2') if is_fk else HexColor('#ffffff'))
        c.setStrokeColor(COL['red'] if is_fk else COL['line'])
        c.setLineWidth(1.8 if is_fk else 1.1)
        if is_fk:c.setDash([5,3])
        c.rect(x,yy,width,40,fill=1,stroke=1)
        c.setDash([])
        txt(c,x+width/2,yy+13.3,name,14,ispk)
        if ispk:
            underline_width=pdfmetrics.stringWidth(name,'BodyBold',14)
            line(c,[(x+(width-underline_width)/2,yy+10.5),(x+(width+underline_width)/2,yy+10.5)],'ink',0.95)
        coords[name]=(x+width/2,yy,x+width,yy+40)
        x+=width
    if x>W-48:raise ValueError(f'Row too long {tb}: {x} > {W-48}')
    cellpos[tb]=coords
    rowout[tb]=(115,x)

# arrows: use six separate parallel routing lanes in left gutter, ensure paths do not mask table rows
arrow_defs=[
 ('users','org_id','organizations','org_id',29),
 ('donations','donor_org_id','organizations','org_id',42),
 ('ngo_requests','ngo_org_id','organizations','org_id',55),
 ('allocations','donation_id','donations','donation_id',68),
 ('allocations','request_id','ngo_requests','request_id',81),
 ('pickups','allocation_id','allocations','allocation_id',94),
]
# Link goes out above source field and around left gutter; final arrow hits bottom of referenced pk.
# choose red source dots and black head triangles at target, path routes may lie adjacent but not over table.
for src,fld,parent,pk,lane in arrow_defs:
    sx,sy,_,sh=cellpos[src][fld]
    tx,ty,_,th=cellpos[parent][pk]
    drop=14 if fld != 'request_id' else 25
    path=[(sx,sy),(sx,sy-drop),(lane,sy-drop),(lane,ty-18),(tx,ty-18),(tx,ty)]
    line(c,path,'red',1.3)
    c.setFillColor(COL['red']);c.circle(sx,sy,3.2,stroke=0,fill=1)
    # filled triangle arrowhead at referenced pk bottom, pointing up
    tri=c.beginPath();tri.moveTo(tx,ty);tri.lineTo(tx-5,ty-10);tri.lineTo(tx+5,ty-10);tri.close()
    c.drawPath(tri,stroke=0,fill=1)

# footer mapping summary, compact 2 columns
line(c,[(45,83),(W-45,83)],'faint',1.5)
txt(c,90,64,'6 FK mappings checked against schema_3nf.sql     •     54 attributes across 6 tables     •     pickups.allocation_id is UNIQUE',12.1,False,align='left',color='muted')
txt(c,W-50,64,'Source: corrected PostgreSQL schema_3nf.sql',12.1,False,align='right',color='muted')
c.showPage();c.save()

# png previews at 100 dpi; PDFs high resolution vector
for pdf,name in [(ER,'ER_Diagram_Exact_3NF.png'),(SC,'Relational_Schema_Exact_3NF.png')]:
    d=fitz.open(pdf)
    pm=d[0].get_pixmap(matrix=fitz.Matrix(1.22,1.22),alpha=False)
    pm.save(OUTPUT+'/'+name)
    d.close()

with open(OUTPUT+'/Schema_Validation.txt','w',encoding='utf-8') as o:
    o.write('FoodBridge Diagram Validation Against schema_3nf.sql\n')
    o.write('Project: Food Waste Redistribution and Resource Allocation System\n')
    o.write('Sruthi Vejju / PES1UG24CS472\nShubashitha Gowtham / PES1UG24CS450\n\n')
    o.write(f'Entities = {len(cols)}; Attributes = {sum(len(v) for v in cols.values())}; PKs = {len(primary)}; FKs = {len(fk)}\n')
    for t,cs in cols.items():
        o.write(f'{t}: {len(cs)} columns; PK={primary[t]}\n  '+', '.join(cs)+'\n')
    o.write('\nForeign keys:\n')
    for a,b,c,d in fk:o.write(f' {a}.{b} -> {c}.{d}\n')
    o.write('\nCardinality: one allocation can have zero or one pickup; each pickup belongs to exactly one allocation due to UNIQUE and NOT NULL FK.\n')
    o.write('3NF basis: organization type is stored only in organizations; app role is derived by JOIN. Remaining normal-form assumptions depend on real-world functional dependencies.\n')
    o.write('MongoDB flexible collections are separate from relational diagrams.\n')

print('made',[(x,os.path.getsize(OUTPUT+'/'+x)) for x in os.listdir(OUTPUT)])
