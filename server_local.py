#!/usr/bin/env python

# this cgibin script expects to be run by a HTTPS server that accepts MIT certificates
# and places the cert info in environment variables

import sys,os,cgi

# debuggin
import cgitb; cgitb.enable()

user_dir = 'files'

# respond with specified status
def http_status(status):
    print 'Status:',status
    print
    sys.exit(0)

# locate user's directory, create if necessary
if not os.path.exists(user_dir):
    try:
        os.mkdir(user_dir)   # default mode 0777
    except:
        http_status('500 Cannot create user directory: %s' % sys.exc_info()[0])

args = cgi.FieldStorage()
json = args.getfirst('json')
file = args.getfirst('file')

if file is None:
    http_status('400 No file name specified')
filename = os.path.join(user_dir,file)

# if user supplied json, save as new file contents
if json is not None:
    try:
        f = open(filename,'w')
        f.write(json)
        f.close()
    except:
        err = sys.exc_info()
        http_status('500 Write failed: %s' % err[1])
    http_status('200 OK')

# request for a file, return as json
if not os.path.exists(filename):
    json = '{}'   # empty library
else:
    try:
        with open(filename,'r') as f:
            json = f.read()
        json = '%s' % json;
    except:
        http_status('500 Read failed: %s' % sys.exc_info()[0])

# send file to the user
print 'Status: 200 OK'
print 'Content-Type: application/json'
print 'Content-Length:',len(json)
print
print json,
