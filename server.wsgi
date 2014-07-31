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

# make a zip archive of the user's files
import zipfile,io,time
def zip_archive(user_dir):
    result = io.BytesIO()
    zip = zipfile.ZipFile(result,'a')   # append new archive to empty file
    # include each user file in the archive, skip backups and autosaves
    for root, dirnames, filenames in os.walk(user_dir):
        for filename in filenames:
            fname = os.path.join(root, filename)  # full path to file
            # set up correct info for archive member
            info = zipfile.ZipInfo(filename=fname[len(user_dir)+1:])
            mtime = time.localtime(os.stat(fname).st_mtime)
            info.date_time = (mtime.tm_year,
                              mtime.tm_mon,
                              mtime.tm_mday,
                              mtime.tm_hour,
                              mtime.tm_min,
                              mtime.tm_sec)
            info.create_system = 0   # fix for Linux zip files read in windows

            f = open(fname,'r')
            zip.writestr(info,bytes(f.read()))
            f.close()
    zip.close()
    return result.getvalue()

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
    response_headers = [('Content-type', 'application/json')]

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

        # see if user wants zip archive
        if args.getfirst('zip') is not None:
            response = zip_archive(user_dir)
            # return archive as an attachment
            response_headers = [('Content-type', 'application/x-zip-compressed'),
                                ('Content-Disposition','attachment; filename=jade.zip')]
            break;

        # otherwise it's a library request
        file = args.getfirst('file')
        if file is None:
            status = '400 No file name specified'
            break
        filename = os.path.join(user_dir,file)

        # if user supplied json, save as new file contents
        j = args.getfirst('json')
        if j is not None:
            try:
                # create backup if we can
                backup = filename + '~'
                if os.path.exists(backup):
                    os.remove(backup)
                if os.path.exists(filename):
                    os.rename(filename,backup)
                
                # write new file contents
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
    response_headers.append(('Content-Length', str(len(response))))
    start_response(status, response_headers)
    return [response]
