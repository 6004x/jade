import sys,json

if len(sys.argv) != 3:
    print "Usage: module_file_in module_file_out"
    sys.exit(0)

f = open(sys.argv[1])
modules = json.load(f)
f.close()

for mname in modules:
    m = modules[mname]
    del m['test']
    del m['schematic']
    m['properties']['readonly'] = {"edit":"no","type":"string","value":"true","label":"Read only?"}

f = open(sys.argv[2],'w')
json.dump(modules,f)
f.close()

