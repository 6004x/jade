# combo HTTP server (GETs) and key/value store (POSTs)
# uses a json file to save user state

try:
    from BaseHTTPServer import BaseHTTPRequestHandler
    import SocketServer as socketserver
except:
    # python 3 compatibility
    from http.server import BaseHTTPRequestHandler
    import socketserver

import mimetypes
import posixpath
import shutil
import os
import cgi
import json
import atexit
import urllib

jsonfile = 'labs.json'
PORT = 8000

class JadeRequestHandler(BaseHTTPRequestHandler):
    def log_message(self,format,*args):
        #print format % args
        return

    # serve up static files
    def do_GET(self):
        path = self.path
        path = path.split('?',1)[0]
        path = path.split('#',1)[0]
        path = path.replace('/','')
        if path == '': path = 'index.html'
        ctype = self.guess_type(path)
        try:
            f = open(path, 'rb')
        except IOError:
            self.send_error(404, "File not found")
            return None
        try:
            self.send_response(200)
            self.send_header("Content-type", ctype)
            fs = os.fstat(f.fileno())
            self.send_header("Content-Length", str(fs[6]))
            self.send_header("Last-Modified", self.date_time_string(fs.st_mtime))
            self.end_headers()

            shutil.copyfileobj(f,self.wfile)
            f.close()
        except:
            f.close()
            raise

    def do_POST(self):
        # determine key, value
        ctype, pdict = cgi.parse_header(self.headers['content-type'])
        postvars = {}
        if ctype == 'multipart/form-data':
            for k,v in cgi.parse_multipart(self.rfile, pdict).items():
                # python3 returns everything as bytes, so decode into strings
                if type(k) == bytes: k = k.decode()
                postvars[k] = [s.decode() if type(s) == bytes else s for s in v]
        elif ctype == 'application/x-www-form-urlencoded':
            length = int(self.headers['content-length'])
            content = self.rfile.read(length)
            for k,v in cgi.parse_qs(content, keep_blank_values=1).items():
                # python3 returns everything as bytes, so decode into strings
                if type(k) == bytes: k = k.decode()
                postvars[k] = [s.decode() if type(s) == bytes else s for s in v]

        key = postvars.get('key',[None])[0]
        value = postvars.get('value',[None])[0]
        self.log_message('%s',json.dumps([key,value]))
        
        # read json file with user's state
        with open(jsonfile,'r') as f:
            labs = json.load(f)

        response = ''
        if value is None:
            # send state for particular lab to user
            response = labs.get(key,'{}')
            response = response.encode('utf-8')
        else:
            # update state for particular lab
            response = value
            labs[key] = value
            with open(jsonfile,'w') as f:
                json.dump(labs,f)
                                                        
        self.send_response(200)
        self.send_header("Content-type", 'text/plain')
        self.send_header("Content-Length", str(len(response)))
        self.end_headers()
        self.wfile.write(response.encode())

    def guess_type(self, path):
        base, ext = posixpath.splitext(path)
        if ext in self.extensions_map:
            return self.extensions_map[ext]
        ext = ext.lower()
        if ext in self.extensions_map:
            return self.extensions_map[ext]
        else:
            return self.extensions_map['']

    if not mimetypes.inited:
        mimetypes.init() # try to read system mime.types
    extensions_map = mimetypes.types_map.copy()
    extensions_map.update({
        '': 'application/octet-stream', # Default
    })
        
httpd = socketserver.TCPServer(("",PORT),JadeRequestHandler)

def cleanup():
  # free the socket
  print("CLEANING UP!")
  httpd.shutdown()
  print("CLEANED UP")

atexit.register(cleanup)
print("Jade Server: port",PORT)
httpd.serve_forever()
