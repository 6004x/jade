#-*-python-*-
# WSGI file server for Jade
# cjt, 7/2014

import sys,os,cgi,glob

lib_path = '/afs/csail.mit.edu/proj/courses/6.004/jade/libraries'

# read in shared libraries for faster service
shared_libs = {}
for lname in glob.glob(os.path.join(lib_path,'shared','*')):
    f = open(lname,'r')
    shared_libs[os.path.basename(lname)] = f.read()
    f.close()

def application(environ, start_response):
    """
    # simple request printout
    status = '200 OK'
    response = 'Hi<p>'+'<br>'.join(["%s" % lib for lib in shared_libs.keys()])
    #response = '<br>'.join(["%s: %s" % (k,v) for k,v in environ.items()])
    #args = cgi.FieldStorage(fp=environ['wsgi.input'],environ=environ,keep_blank_values=True)
    #response = '<br>'.join(["%s: %s" % (k,args[k].value) for k in args.keys()])
    response_headers = [('Content-type', 'text/html'),
                        ('Content-Length', str(len(response)))]
    start_response(status, response_headers)
    return [response]
    """

    status = '200 OK'
    response = '{}'

    once = True;
    while (once):       # just to have something to break out of
        once = False;

        # use email from MIT certificate, otherwise 'guest'
        requester = environ.get('SSL_CLIENT_S_DN_Email','guest')

        # locate user's directory, create if necessary
        user_dir = os.path.join(lib_path,requester)
        if not os.path.exists(user_dir):
            try:
                os.mkdir(user_dir)
            except:
                status = '500 Cannot create user directory: %s' % sys.exc_info()[0]
                break

        args = cgi.FieldStorage(fp=environ['wsgi.input'],environ=environ,keep_blank_values=True)
        file = args.getfirst('file')
        if file is None:
            status = '400 No file name specified'
            break
        filename = os.path.join(user_dir,file)

        # if user supplied json, save as new file contents
        j = args.getfirst('json')
        if j is not None:
            try:
                f = open(filename,'w')
                f.write(j)
                f.close()
            except:
                status = '500 Write failed: %s' % sys.exc_info()[0]
            break

        # request for a file, return as json
        if not os.path.exists(filename):
            if shared_libs.has_key(file):
                response = '[%s,"shared"]' % shared_libs[file]
            else:
                response = '[{},"%s"]' % requester    # empty library
        else:
            try:
                f = open(filename,'r')
                response = f.read()
                f.close()
                response = '[%s,"%s"]' % (response,requester)
            except:
                status = '500 Read failed: %s' % sys.exc_info()[0]
                break

    # send response to user
    response_headers = [('Content-type', 'application/json'),
                        ('Content-Length', str(len(response)))]
    start_response(status, response_headers)
    return [response]
