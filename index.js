/**
 * Standard Cloudflare Workers Listener
 * Distributing request handling according to URL pattern
 */
addEventListener('fetch', event => {
  let url = new URL(event.request.url);
  let ext = url.pathname.split('.').pop();
  let userAgent = event.request.headers.get('user-agent') || '';
  if(url.pathname.startsWith('/c/')) {
    // Creating a new Short URL
    event.respondWith(ahrefCreate(url.searchParams.get('q') || '', url.searchParams.get('t') || '', url.searchParams.get('f') || '', url.searchParams.get('c') || ''));
  } else if(url.pathname == '/' || url.pathname.lastIndexOf('/') > 0) {
    // Returning whatever we actually host under our domain for the root / and sub-directories (e.g. a nice front-end)
    event.respondWith(pageRead(url.pathname,ext))
  } else if(url.pathname.lastIndexOf('/') === 0) {
    // Returning the redirect logic
    if (ext == 'js') {
      event.respondWith(ahrefReadJson(url.pathname.substring(1,10)));
    } else if (ext == 'svg') {
      event.respondWith(ahrefReadQr(url.origin,url.pathname.substring(1,10),url.search));
    } else {
      event.respondWith(ahrefRead(url.pathname.substring(1,10),userAgent,url.search));
    }
  } else
    // Other requests get 404
    event.respondWith(r404());
})

/**
 * CONFIG SECTION
 */
const FB_URL = 'https://yourproject-xxxxx.firebaseio.com/';
const FB_KEY = 'YourFirebaseDatabaseSecret';
// Default Google Analytics ID
const UA_ID = 'UA-123456789-1';
// Default Facebook ID
const FB_ID = '123456789';

/**
 * Include third-party dependencies
 */
const shortid = require('shortid');
const qr = require('qrcode-svg');

/**
 * Test user agent for bot strings
 * @param {string} userAgent 
 */
const isBot = userAgent => (userAgent.match(/bot|facebook|crawl|spider/i));

/**
 * A simple 404 response
 */
const r404 = () => (new Response("Not found what you're looking for",{status: 404}));

/**
 * A simple 301 redirect
 * @param {string} location 
 */
const r301 = location => (new Response('', { status: 301, headers: { 'Location': location } }));

/**
 * A simple JSON response with given status code and CORS enabled
 * @param {object} data 
 * @param {number} status 
 */
const rJson = (status,data) => (
  new Response(JSON.stringify(data),
  {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    status: status
  }
  )
)

/**
 * The Create function which generates a new Short Id for a given destination URL and PUTs it into the database
 * @param {string} longUrl
 * @param {string} analyticsId
 * @param {string} facebookId
 * @param {string} campaign
 */
async function ahrefCreate(longUrl, analyticsId, facebookId, campaign) {

	if(!longUrl || !longUrl.match(/^https?:\/\//i)) {
		return rJson(400, {error:"URL must begin with http(s)://"});
	}

	let shortId = shortid.generate();
  let url = FB_URL+'links/'+shortId+'.json?auth='+FB_KEY;

  // PUTting a new URL into Firebase DB
  let init = {
    method: 'PUT',
    body: JSON.stringify({
    	shortId: shortId,
    	longUrl: longUrl,
      createdAt: new Date().getTime(),
      analyticsId: analyticsId || UA_ID,
      facebookId: facebookId || FB_ID,
      campaign: campaign
    }),
    headers: {
    	'Content-Type': 'application/json'
    }
  }
  const fbReq = new Request(url, init);
  let res = await fetch(fbReq);

  if(res.status === 200) {
  	let data = await res.json();
    return rJson(200, data)
  } else {
	  return rJson(400, {error:"n/a"})
  }

}

/**
 * The Read function which looks up Short Ids in the database to grab the corresponding Long URLs
 * Returns our tracking template for regular users and 301 redirects for bots to allow for link previews
 * @param {string} shortId
 * @param {string} userAgent
 */
async function ahrefRead(shortId,userAgent,search) {

  if (search == '?') { search = '';}
  let url = FB_URL+'links/'+shortId+'.json?auth='+FB_KEY;
  
  let init = {
    method: 'GET'
  }
  const fbReq = new Request(url, init);

  let res = await fetch(fbReq);

  if(res.status === 200) {
  	let data = await res.json();

  	if(!data) {
      return r404();
    } else if (isBot(userAgent)) {
      return r301(data.longUrl+search);
    } else {
      return rMain(200,data.longUrl+search,data.analyticsId,data.facebookId,data.campaign);
    }
  
  } else {
	  return r404();
  }

}

async function ahrefReadJson(shortId) {

  let url = FB_URL+'links/'+shortId+'.json?auth='+FB_KEY;
  
  let init = {
    method: 'GET'
  }
  const fbReq = new Request(url, init);

  let res = await fetch(fbReq);

  if(res.status === 200) {
    let data = await res.json();

    if(!data) {
      return rJson(404, {error:"n/a"});
    } else {
      return rJson(200, data);
    }
  
  } else {
    return rJson(404, {error:"n/a"});
  }

}

async function ahrefReadQr(origin,shortId,search) {

  if (search == '?') { search = '';}
  let url = FB_URL+'links/'+shortId+'.json?auth='+FB_KEY;
  
  let init = {
    method: 'GET'
  }
  const fbReq = new Request(url, init);

  let res = await fetch(fbReq);

  if(res.status === 200) {
    let data = await res.json();

    if(!data) {
      return r404();
    } else {
      const qr_svg = new qr({
        content: origin+'/'+shortId+search,
        join: true,
        container: "svg-viewbox",
        ecl: "L"
      }).svg();
      return new Response(qr_svg, {
        headers: {
          'Content-Type': 'image/svg'
        },
        status: 200
      });
    }
  
  } else {
    return r404();
  }

}


/**
 * The webpage Read function which looks up static pages in the database and returns the result
 * @param {string} pathname
 * @param {string} ext
 */
async function pageRead(pathname, ext) {

  let name = pathname.replace(/\//g, '_').replace(/\./g, '-');
  let url = FB_URL+'pages/'+name+'.json?auth='+FB_KEY;

  switch (ext) {
    case "js":
      var mt = "text/javascript";
      break;
    case "css":
      var mt = "text/css";
      break;
    default:
      var mt = "text/html";
    }
  
  let init = {
    method: 'GET'
  }
  const fbReq = new Request(url, init);

  let res = await fetch(fbReq);

  if(res.status === 200) {
  	let data = await res.json();

  	if(!data) {
      return r404();
    } else {
	return new Response(
	    data,
	    {
    		headers: {
    		    'Content-Type': mt+'; charset=utf-8'
    		},
    		status: 200
	    }
	)
    }
  
  } else {
	  return r404();
  }

}

/**
 * The standard HTML template which includes our tracking scripts
 * as well as the redirect to the final destination
 * @param {number} status 
 * @param {string} longUrl
 * @param {string} analyticsId
 * @param {string} facebookId
 * @param {string} campaign
 */
function rMain(status,longUrl,analyticsId,facebookId,campaign) {

  let body = `<!doctype html><html lang="en">
    <head>
      <meta charset="utf-8">
      <title>You're being redirected...</title>
      ${facebookId ? `
      <!-- Facebook Tracking Pixel -->
      <script>
        !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
        n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
        document,'script','https://connect.facebook.net/en_US/fbevents.js');
        fbq('init', '${facebookId}'); 
        fbq('track', 'PageView');
      </script>
      <noscript>
      <img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${facebookId}&ev=PageView&noscript=1" />
      </noscript>
      ` : ''}
      ${analyticsId ? `
      <!-- Global site tag (gtag.js) - Google Analytics -->
      <script src="https://www.googletagmanager.com/gtag/js?id=${analyticsId}"></script>
      <script>
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());

        gtag('config', '${analyticsId}', { 'transport_type': 'beacon' ${campaign ? `, 'page_title': '${campaign}'` : ''} });
      </script>
      ` : ''}
      <script>
          var timer = setTimeout(function() {
            window.location='${longUrl}' 
          }, 500);
      </script>
    </head>
    <body>
      <noscript>
        Redirecting to <a href="${longUrl}">${longUrl}</a>
      </noscript>
    </body>
    </html>`;

	return new Response(
    body,
    {
      headers: {
        'Content-Type': 'text/html; charset=utf-8'
      },
      status: status
    }
  )

}
