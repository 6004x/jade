#!/usr/bin/env python

# this cgibin script expects to be run by a HTTPS server that accepts MIT certificates
# and places the cert info in environment variables

import sys,os,cgi

# debuggin
import cgitb; cgitb.enable()

# directory this script lives in
sdir = os.path.dirname(os.environ['SCRIPT_FILENAME'])
lib_path = os.path.join(sdir,'libraries')

# certificate emails for authorized users
auth_user = [
 'cjt@MIT.EDU',
 'ward@MIT.EDU',
 'white@MIT.EDU',
 'silvina@MIT.EDU',
]


# respond with specified status
def http_status(status):
    print 'Status:',status
    print
    sys.exit(0)

# see if requester is an authorized user
requester = os.environ.get('SSL_CLIENT_S_DN_Email','???')   
if not requester in auth_user:
    requester = 'guest'
    #http_status('401 %s not authorized' % requester)

# locate user's directory, create if necessary
user_dir = os.path.join(lib_path,requester)
if not os.path.exists(user_dir):
    try:
        os.mkdir(user_dir)
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
        http_status('500 Write failed: %s' % sys.exc_info()[0])
    http_status('200 OK')

# request for a file, return as json
source = requester
if not os.path.exists(filename):
    filename = os.path.join(lib_path,'shared',file)
    source = 'shared'
if not os.path.exists(filename):
    json = '[[],"%s"]' % requester    # empty library
else:
    try:
        f = open(filename,'r')
        json = f.read()
        f.close()
        json = '[%s,"%s"]' % (json,source)
    except:
        http_status('500 Read failed: %s' % sys.exc_info()[0])

# send file to the user
print 'Status: 200 OK'
print 'Content-Type: application/json'
print 'Content-Length:',len(json)
print
print json,
