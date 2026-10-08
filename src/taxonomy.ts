// Posts › Categories and Tags as multiselects in the post editor.
// Upstream renders array fields as "Add item" lists (one reference picker or text box per row). On the
// post form BizzCMS swaps those two fields for a searchable multiselect with chips:
//   - Categories: pick from the Categories collection, filtered to the post's Section (blog / news).
//   - Tags: pick from the tags already used on posts, or type a new one (Enter or comma).
// The saved data stays the same shape upstream expects: a JSON array of category root ids and a JSON
// array of tag strings. GET /admin/bizz/taxonomy feeds the lists (signed-in users only).

export async function taxonomyRoute(request: Request, path: string, db: D1Database, signedIn: () => Promise<boolean>): Promise<Response | null> {
  if (path !== '/admin/bizz/taxonomy' || request.method !== 'GET') return null
  if (!(await signedIn())) return Response.json({ error: 'Sign in required' }, { status: 401 })
  const live = `tenant_id = 'default' AND is_current_draft = 1 AND deleted_at IS NULL`
  const [cats, tags] = await Promise.all([
    db.prepare(`SELECT root_id AS id, title, json_extract(data, '$.section') AS section FROM documents WHERE type_id = 'categories' AND ${live} ORDER BY title COLLATE NOCASE`).all<{ id: string; title: string; section: string | null }>(),
    db.prepare(`SELECT MIN(j.value) AS tag, COUNT(*) AS n FROM documents d, json_each(CASE WHEN json_valid(d.data) AND json_type(d.data, '$.tags') = 'array' THEN json_extract(d.data, '$.tags') ELSE '[]' END) j
      WHERE d.type_id = 'posts' AND d.tenant_id = 'default' AND d.is_current_draft = 1 AND d.deleted_at IS NULL AND j.type = 'text' AND trim(j.value) <> ''
      GROUP BY lower(trim(j.value)) ORDER BY n DESC, tag LIMIT 5000`).all<{ tag: string; n: number }>()
  ])
  return Response.json({ categories: cats.results, tags: tags.results.map(t => t.tag) }, { headers: { 'cache-control': 'no-store' } })
}

export const TAXONOMY_SCRIPT = `<script>(function(){
var form=document.getElementById('content-form');if(!form)return;
var col=form.querySelector('[name="collection_id"]');if(!col||col.value!=='posts')return;
function box(name){return form.querySelector('[data-structured-array][data-field-name="'+name+'"]')}
var catBox=box('categories'),tagBox=box('tags');if(!catBox&&!tagBox)return;
function read(el){var h=el&&el.querySelector('input[type=hidden][name]');try{var v=JSON.parse(h&&h.value||'[]');return Array.isArray(v)?v.map(function(x){return typeof x==='string'?x:(x&&(x.value||x.id||x.tag))||''}).filter(Boolean):[]}catch(e){return []}}
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function widget(old,name,opts){
  var values=read(old),wrap=document.createElement('div');wrap.className='bizz-ms';wrap.setAttribute('data-bizz-ms',name);
  wrap.innerHTML='<label class="bizz-ms-label" for="bizz-ms-'+name+'">'+esc(opts.label)+'</label><input type="hidden" name="'+name+'" id="field-'+name+'"><div class="bizz-ms-box"><span class="bizz-ms-chips"></span><input type="text" id="bizz-ms-'+name+'" class="bizz-ms-input" autocomplete="off" placeholder="'+esc(opts.placeholder)+'"></div><ul class="bizz-ms-list" role="listbox" hidden></ul>';
  old.parentNode.replaceChild(wrap,old);
  var hidden=wrap.querySelector('input[type=hidden]'),chips=wrap.querySelector('.bizz-ms-chips'),input=wrap.querySelector('.bizz-ms-input'),list=wrap.querySelector('.bizz-ms-list'),active=-1;
  function sync(){hidden.value=JSON.stringify(values);chips.innerHTML=values.map(function(v,i){return '<span class="bizz-ms-chip">'+esc(opts.label_of(v))+'<button type="button" data-i="'+i+'" aria-label="Remove">×</button></span>'}).join('');}
  function has(v){return values.some(function(x){return x.toLowerCase()===String(v).toLowerCase()})}
  function add(v){v=String(v).trim();if(!v||has(v))return;values.push(v);sync();input.value='';render();}
  function render(){var q=input.value.trim().toLowerCase(),items=opts.options().filter(function(o){return !has(o.value)&&(!q||o.label.toLowerCase().indexOf(q)>-1)}).slice(0,60);
    var html=items.map(function(o,i){return '<li role="option" data-v="'+esc(o.value)+'"'+(i===active?' class="on"':'')+'>'+esc(o.label)+(o.hint?' <small>'+esc(o.hint)+'</small>':'')+'</li>'}).join('');
    if(opts.create&&q&&!has(q)&&!items.some(function(o){return o.label.toLowerCase()===q}))html+='<li role="option" data-new="1" data-v="'+esc(input.value.trim())+'">Add “'+esc(input.value.trim())+'”</li>';
    if(!html)html='<li class="bizz-ms-empty">'+esc(opts.empty())+'</li>';list.innerHTML=html;}
  function open(){render();list.hidden=false}function close(){list.hidden=true;active=-1}
  input.addEventListener('focus',open);input.addEventListener('blur',function(){setTimeout(close,120)});input.addEventListener('input',function(){active=-1;open()});
  input.addEventListener('keydown',function(e){var lis=list.querySelectorAll('li[data-v]');
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(!lis.length)return;active=(active+(e.key==='ArrowDown'?1:-1)+lis.length)%lis.length;render();list.hidden=false;return}
    if(e.key==='Enter'||(opts.create&&e.key===',')){e.preventDefault();var pick=active>-1&&lis[active]?lis[active]:(opts.create?null:lis[0]);if(pick)add(pick.getAttribute('data-v'));else if(opts.create)add(input.value);return}
    if(e.key==='Backspace'&&!input.value&&values.length){values.pop();sync();render()}
    if(e.key==='Escape')close()});
  list.addEventListener('mousedown',function(e){var li=e.target.closest('li[data-v]');if(!li)return;e.preventDefault();add(li.getAttribute('data-v'));input.focus()});
  chips.addEventListener('click',function(e){var b=e.target.closest('button[data-i]');if(!b)return;values.splice(+b.getAttribute('data-i'),1);sync();render()});
  wrap.querySelector('.bizz-ms-box').addEventListener('click',function(e){if(e.target===this||e.target===chips)input.focus()});
  document.addEventListener('click',function(e){if(!wrap.contains(e.target))close()});
  sync();return {refresh:function(){sync();if(!list.hidden)render()}};
}
fetch('/admin/bizz/taxonomy',{credentials:'same-origin'}).then(function(r){return r.ok?r.json():{categories:[],tags:[]}}).catch(function(){return {categories:[],tags:[]}}).then(function(data){
  var cats=data.categories||[],byId={};cats.forEach(function(c){byId[c.id]=c});
  var sectionEl=form.querySelector('[name="section"]');function section(){return sectionEl&&sectionEl.value||'blog'}
  if(catBox){var cw=widget(catBox,'categories',{label:'Categories',placeholder:'Search categories…',
    label_of:function(id){return byId[id]?byId[id].title:'Unknown category'},
    options:function(){var s=section();return cats.filter(function(c){return !c.section||c.section===s}).map(function(c){return {value:c.id,label:c.title}})},
    empty:function(){return cats.length?'No more categories in this section.':'No categories yet. Add them under Content › Categories.'}});
    if(sectionEl)sectionEl.addEventListener('change',function(){cw.refresh()});}
  if(tagBox)widget(tagBox,'tags',{label:'Tags',placeholder:'Search or add a tag…',create:true,
    label_of:function(t){return t},options:function(){return (data.tags||[]).map(function(t){return {value:t,label:t}})},
    empty:function(){return 'Type a new tag and press Enter.'}});
});
})();</script>`
