import glob,sys,os.path,json

lib = {}
for m in glob.glob(os.path.join(sys.argv[1],'*')):
    f = open(m)
    lib[os.path.basename(m)] = json.load(f)
    f.close()

f = open(sys.argv[1]+'.lib','w')
json.dump(lib,f)
f.close()
