import sys,random,re

cycle = 0   # used to count test cycles

# output TEST aspect representation for a value of the specified width
# specify choices as '01' for inputs
# specify choices as 'LH' for outputs
# value of None is always output as '-'
def field(f,width,value,choices,suffix=' '):
    for i in xrange(width):
        if value is None:
            f.write('-')
        else:
            f.write(choices[1] if (1 << (width-1-i)) & value else choices[0])
    f.write(suffix)

def xfield(f,width,s,choices,suffix=' '):
    for i in xrange(width):
        v = '-' if ((s is None) or s[i] in '?ZX') else choices[0] if s[i]=='0' else choices[1]
        f.write(v)
    f.write(suffix)

##################################################
##  lab2
##################################################

def lab2_test_cycle(f,a,b,y):
    global cycle
    cycle += 1
    field(f,3,a,'01')
    field(f,3,b,'01')
    field(f,4,y,'LH')
    f.write('// {:2d}: a={:d}, b={:d}, y={:d}\n'.format(cycle,a,b,y))

def lab2_test(f):
    cycle = 0
    for a,b in ((0,1), (1,1), (2, 2), (4, 4), (0, 0), (1, 7), (2, 5), (7,7)):
        lab2_test_cycle(f,a,b,a+b)
        if a != b:
            lab2_test_cycle(f,b,a,a+b)

#lab2_test(sys.stdout)

##################################################
##  bool
##################################################

def bool_test_cycle(f,fn,a,b,y):
    global cycle
    cycle += 1
    field(f,4,fn,'01')
    field(f,32,a,'01')
    field(f,32,b,'01')
    field(f,32,y,'LH')
    f.write('// {:2d}: fn={:#06b}, a={:#010X}, b={:#010X}, y={:#010X}\n'.format(cycle,fn,a & 0xFFFFFFFF,b & 0xFFFFFFFF,y & 0xFFFFFFFF))

def bool_test(f):
    cycle = 0
    a = 0xFF00FF00
    b = 0xFFFF0000
    bool_test_cycle(f,0b0000,a,b,0)
    bool_test_cycle(f,0b0001,a,b,~(a | b))
    bool_test_cycle(f,0b0010,a,b,a & ~b)
    bool_test_cycle(f,0b0011,a,b,~b)
    bool_test_cycle(f,0b0100,a,b,~a & b)
    bool_test_cycle(f,0b0101,a,b,~a)
    bool_test_cycle(f,0b0110,a,b,a ^ b)
    bool_test_cycle(f,0b0111,a,b,~(a & b))
    bool_test_cycle(f,0b1000,a,b,a & b)
    bool_test_cycle(f,0b1001,a,b,~(a ^ b))
    bool_test_cycle(f,0b1010,a,b,a)
    bool_test_cycle(f,0b1011,a,b,a | ~b)
    bool_test_cycle(f,0b1100,a,b,b)
    bool_test_cycle(f,0b1101,a,b,~a | b)
    bool_test_cycle(f,0b1110,a,b,a | b)
    bool_test_cycle(f,0b1111,a,b,-1)

#bool_test(sys.stdout)

##################################################
##  cmp
##################################################

def cmp_test_cycle(f,fn,z,v,n,y):
    global cycle
    cycle += 1
    field(f,2,fn,'01')
    field(f,3,(z << 2)+(v << 1)+n,'01')
    field(f,32,y,'LH')
    fn = ['???','CMPEQ','CMPLT','CMPLE'][fn]
    f.write('// {:2d}: fn={:s}, z={:d}, v={:d}, n={:d}, y={:d}\n'.format(cycle,fn,z,v,n,y & 1))

def cmp_test(f):
    global cycle
    cycle = 0
    for zvn in xrange(7):
        z = (zvn >> 2) & 1
        v = (zvn >> 1) & 1
        n = zvn & 1
        cmp_test_cycle(f,0b01,z,v,n,z)
        cmp_test_cycle(f,0b10,z,v,n,n ^ v)
        cmp_test_cycle(f,0b11,z,v,n,z | (n ^ v))

#cmp_test(sys.stdout)

##################################################
##  arith
##################################################

def arith_test_cycle(f,fn,a,b,y,z,v,n):
    global cycle
    cycle += 1
    field(f,1,fn,'01')
    field(f,32,a,'01')
    field(f,32,b,'01')
    field(f,32,y,'LH')
    field(f,3,(z << 2)+(v << 1)+n,'LH')
    f.write('// {:2d}: fn={:d}, a={:#010X}, b={:#010X}, y={:#010X}\n'.format(cycle,fn,a & 0xFFFFFFFF,b & 0xFFFFFFFF,y & 0xFFFFFFFF))

def arith_result(fn,a,b):
    amsb = (a >> 31) & 1;
    if (fn & 1) == 0:  # add
        y = a + b
        bmsb = (b >> 31) & 1
    else:
        y = a + (~b) + 1
        bmsb = (~b >> 31) & 1
    y &= 0xFFFFFFFF
    ymsb = (y >> 31) & 1
    z = 1 if y == 0 else 0
    v = 1 if (amsb == bmsb and amsb != ymsb) else 0
    n = 1 if ymsb else 0
    return (y,z,v,n)

def arith_test(f):
    global cycle
    cycle = 0
    for fn in (0,1):
        for a in (0,1,-1,0xAAAAAAAA,0x55555555):
            for b in (0,1,-1,0xAAAAAAAA,0x55555555):
                y,z,v,n = arith_result(fn,a,b)
                arith_test_cycle(f,fn,a,b,y,z,v,n)

#arith_test(sys.stdout)

##################################################
##  shift
##################################################

def shift_test_cycle(f,fn,a,b,y):
    global cycle
    cycle += 1
    field(f,2,fn,'01')
    field(f,32,a,'01')
    field(f,5,b,'01')
    field(f,32,y,'LH')
    op = ['SHL','SHR','???','SRA'][fn]
    f.write('// {:3d}: fn={:s}, a={:#010X}, b={:2d}, y={:#010X}\n'.format(cycle,op,a & 0xFFFFFFFF,b,y & 0xFFFFFFFF))

def shift_test(f):
    global cycle
    cycle = 0
    for a in (0,1,0xFFFFFFFF,0x12345678,0xFEDCBA98):
        for b in (0,1,2,4,8,16,31):
            shift_test_cycle(f,0b00,a,b,a << b)
            shift_test_cycle(f,0b01,a,b,a >> b)
            shift_test_cycle(f,0b11,a,b,(a if a < 0x80000000 else 0xFFFFFFFF00000000+a) >> b)

#shift_test(sys.stdout)

##################################################
##  alu
##################################################

op = [
    "?", "?", "?", "CMPEQ", "?", "CMPLT", "?", "CMPLE", "?", "?", "?", "?", "?", "?", "?", "?",
    "ADD", "SUB", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?",
    "F0000", "F0001", "F0010", "F0011", "F0100", "F0101", "XOR", "F0111", "AND", "XNOR", "A", "F1011", "F1100", "F1101", "OR", "F1111",
    "SHL", "SHR", "?", "SRA", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?",
]

def alu_test_cycle(f,fn,a,b,y):
    global cycle
    cycle += 1
    aluy,z,v,n = arith_result(fn & 1,a,b)
    field(f,6,fn,'01')
    field(f,32,a,'01')
    field(f,32,b,'01')
    field(f,32,y,'LH')
    field(f,3,(z << 2)+(v<<1)+n,'LH')
    f.write('// %3d: fn=%5s, a=0x%08x, b=0x%08x, y=0x%08x\n' % (cycle,op[fn],a,b,y & 0xFFFFFFFF))

def alu_test(f):
    global cycle
    cycle = 0

    # test boole
    BOOL = 0b100000
    a = 0xFF00FF00
    b = 0xFFFF0000
    alu_test_cycle(f,BOOL + 0b0000,a,b,0)
    alu_test_cycle(f,BOOL + 0b0001,a,b,~(a | b))
    alu_test_cycle(f,BOOL + 0b0010,a,b,a & ~b)
    alu_test_cycle(f,BOOL + 0b0011,a,b,~b)
    alu_test_cycle(f,BOOL + 0b0100,a,b,~a & b)
    alu_test_cycle(f,BOOL + 0b0101,a,b,~a)
    alu_test_cycle(f,BOOL + 0b0110,a,b,a ^ b)
    alu_test_cycle(f,BOOL + 0b0111,a,b,~(a & b))
    alu_test_cycle(f,BOOL + 0b1000,a,b,a & b)
    alu_test_cycle(f,BOOL + 0b1001,a,b,~(a ^ b))
    alu_test_cycle(f,BOOL + 0b1010,a,b,a)
    alu_test_cycle(f,BOOL + 0b1011,a,b,a | ~b)
    alu_test_cycle(f,BOOL + 0b1100,a,b,b)
    alu_test_cycle(f,BOOL + 0b1101,a,b,~a | b)
    alu_test_cycle(f,BOOL + 0b1110,a,b,a | b)
    alu_test_cycle(f,BOOL + 0b1111,a,b,-1)

    # test shift
    SHL = 0b110000
    SHR = 0b110001
    SRA = 0b110011
    for a in (0,1,0xFFFFFFFF,0x12345678,0xFEDCAB98):
        for b in (0,1,2,4,8,16,31):
            alu_test_cycle(f,SHL,a,b,a << b)
            alu_test_cycle(f,SHR,a,b,a >> b)
            alu_test_cycle(f,SRA,a,b,(a if a < 0x80000000 else 0xFFFFFFFF00000000+a) >> b)

    # test arith
    ADD = 0b010000
    SUB = 0b010001
    for fn in (ADD, SUB):
        for a in (0,1,-1,0xAAAAAAAA,0x55555555):
            for b in (0,1,-1,0xAAAAAAAA,0x55555555):
                y,z,v,n = arith_result(fn,a,b)
                alu_test_cycle(f,fn,a,b,y)

    # test cmp
    CMPEQ = 0b000011
    CMPLT = 0b000101
    CMPLE = 0b000111
    alu_test_cycle(f,CMPEQ,0x00000005,0xDEADBEEF,0) # z=0, v=0, n=0
    alu_test_cycle(f,CMPLT,0x00000005,0xDEADBEEF,0) # z=0, v=0, n=0
    alu_test_cycle(f,CMPLE,0x00000005,0xDEADBEEF,0) # z=0, v=0, n=0

    alu_test_cycle(f,CMPEQ,0x12345678,0x12345678,1) # z=1, v=0, n=0
    alu_test_cycle(f,CMPLT,0x12345678,0x12345678,0) # z=1, v=0, n=0
    alu_test_cycle(f,CMPLE,0x12345678,0x12345678,1) # z=1, v=0, n=0

    alu_test_cycle(f,CMPEQ,0x80000000,0x00000001,0) # z=0, v=1, n=0
    alu_test_cycle(f,CMPLT,0x80000000,0x00000001,1) # z=0, v=1, n=0
    alu_test_cycle(f,CMPLE,0x80000000,0x00000001,1) # z=0, v=1, n=0

    alu_test_cycle(f,CMPEQ,0xDEADBEEF,0x00000005,0) # z=0, v=0, n=1
    alu_test_cycle(f,CMPLT,0xDEADBEEF,0x00000005,1) # z=0, v=0, n=1
    alu_test_cycle(f,CMPLE,0xDEADBEEF,0x00000005,1) # z=0, v=0, n=1

    alu_test_cycle(f,CMPEQ,0x7FFFFFFF,0xFFFFFFFF,0) # z=0, v=1, n=1
    alu_test_cycle(f,CMPLT,0x7FFFFFFF,0xFFFFFFFF,0) # z=0, v=1, n=1
    alu_test_cycle(f,CMPLE,0x7FFFFFFF,0xFFFFFFFF,0) # z=0, v=1, n=1

#alu_test(sys.stdout)

##################################################
##  alu timing
##################################################

last_y = None

def alu_timing_test_cycle(f,fn,a,b,y):
    global cycle,last_y
    cycle += 1
    field(f,6,fn,'01')
    field(f,32,a,'01')
    field(f,32,b,'01')
    field(f,32,last_y,'LH')
    if last_y is None:
        ytxt = 'not checked'
    else:
        ytxt = '0x%08x' % (last_y & 0xFFFFFFFF)
    f.write('// %3d: fn=%5s, a=0x%08x, b=0x%08x, y=%s\n' % (cycle,op[fn],a,b,ytxt))
    last_y = y

def alu_timing_test(f):
    global cycle,last_y
    cycle = 0
    last_y = None

    # test boole
    BOOL = 0b100000
    a = 0xFF00FF00
    b = 0xFFFF0000
    alu_timing_test_cycle(f,BOOL + 0b0000,a,b,0)
    alu_timing_test_cycle(f,BOOL + 0b0001,a,b,~(a | b))
    alu_timing_test_cycle(f,BOOL + 0b0010,a,b,a & ~b)
    alu_timing_test_cycle(f,BOOL + 0b0011,a,b,~b)
    alu_timing_test_cycle(f,BOOL + 0b0100,a,b,~a & b)
    alu_timing_test_cycle(f,BOOL + 0b0101,a,b,~a)
    alu_timing_test_cycle(f,BOOL + 0b0110,a,b,a ^ b)
    alu_timing_test_cycle(f,BOOL + 0b0111,a,b,~(a & b))
    alu_timing_test_cycle(f,BOOL + 0b1000,a,b,a & b)
    alu_timing_test_cycle(f,BOOL + 0b1001,a,b,~(a ^ b))
    alu_timing_test_cycle(f,BOOL + 0b1010,a,b,a)
    alu_timing_test_cycle(f,BOOL + 0b1011,a,b,a | ~b)
    alu_timing_test_cycle(f,BOOL + 0b1100,a,b,b)
    alu_timing_test_cycle(f,BOOL + 0b1101,a,b,~a | b)
    alu_timing_test_cycle(f,BOOL + 0b1110,a,b,a | b)
    alu_timing_test_cycle(f,BOOL + 0b1111,a,b,-1)

    # test shift
    SHL = 0b110000
    SHR = 0b110001
    SRA = 0b110011
    for a in (0,1,0xFFFFFFFF,0x12345678,0xFEDCAB98):
        for b in (0,1,2,4,8,16,31):
            alu_timing_test_cycle(f,SHL,a,b,a << b)
            alu_timing_test_cycle(f,SHR,a,b,a >> b)
            alu_timing_test_cycle(f,SRA,a,b,(a if a < 0x80000000 else 0xFFFFFFFF00000000+a) >> b)

    # test arith
    ADD = 0b010000
    SUB = 0b010001
    for fn in (ADD, SUB):
        for a in (0,1,-1,0xAAAAAAAA,0x55555555):
            for b in (0,1,-1,0xAAAAAAAA,0x55555555):
                y,z,v,n = arith_result(fn,a,b)
                alu_timing_test_cycle(f,fn,a,b,y)

    # test cmp
    CMPEQ = 0b000011
    CMPLT = 0b000101
    CMPLE = 0b000111
    alu_timing_test_cycle(f,CMPEQ,0x00000005,0xDEADBEEF,0) # z=0, v=0, n=0
    alu_timing_test_cycle(f,CMPLT,0x00000005,0xDEADBEEF,0) # z=0, v=0, n=0
    alu_timing_test_cycle(f,CMPLE,0x00000005,0xDEADBEEF,0) # z=0, v=0, n=0

    alu_timing_test_cycle(f,CMPEQ,0x12345678,0x12345678,1) # z=1, v=0, n=0
    alu_timing_test_cycle(f,CMPLT,0x12345678,0x12345678,0) # z=1, v=0, n=0
    alu_timing_test_cycle(f,CMPLE,0x12345678,0x12345678,1) # z=1, v=0, n=0

    alu_timing_test_cycle(f,CMPEQ,0x80000000,0x00000001,0) # z=0, v=1, n=0
    alu_timing_test_cycle(f,CMPLT,0x80000000,0x00000001,1) # z=0, v=1, n=0
    alu_timing_test_cycle(f,CMPLE,0x80000000,0x00000001,1) # z=0, v=1, n=0

    alu_timing_test_cycle(f,CMPEQ,0xDEADBEEF,0x00000005,0) # z=0, v=0, n=1
    alu_timing_test_cycle(f,CMPLT,0xDEADBEEF,0x00000005,1) # z=0, v=0, n=1
    alu_timing_test_cycle(f,CMPLE,0xDEADBEEF,0x00000005,1) # z=0, v=0, n=1

    alu_timing_test_cycle(f,CMPEQ,0x7FFFFFFF,0xFFFFFFFF,0) # z=0, v=1, n=1
    alu_timing_test_cycle(f,CMPLT,0x7FFFFFFF,0xFFFFFFFF,0) # z=0, v=1, n=1
    alu_timing_test_cycle(f,CMPLE,0x7FFFFFFF,0xFFFFFFFF,0) # z=0, v=1, n=1

    # worst-case timing
    alu_timing_test_cycle(f,1,0,0,None)
    alu_timing_test_cycle(f,CMPLT,0x7FFFFFFF,0xFFFFFFFF,0) # z=0, v=1, n=1
    alu_timing_test_cycle(f,0,0,0,None)
    alu_timing_test_cycle(f,0,0,0,None)

#alu_timing_test(sys.stdout)

##################################################
##  regfile
##################################################

def regfile_test_cycle(f,ra2sel,wasel,werf,ra,rb,rc,wdata,radata,rbdata):
    global cycle
    cycle += 1

    field(f,2,2*ra2sel + wasel,'01')
    field(f,1,werf,'01')
    field(f,5,ra,'01')
    field(f,5,rb,'01')
    field(f,5,rc,'01')
    field(f,32,wdata,'01')
    field(f,32,radata,'LH')
    field(f,32,rbdata,'LH')
    f.write(' // %3d: Ra[%s]==%s, %s[%s]==%s' % (cycle,ra,radata,'Rc' if ra2sel else 'Rb',rc if ra2sel else rb,rbdata))
    if werf:
        f.write(' Reg[%s]=%s' % (30 if wasel else rc,wdata))
    f.write('\n')

def regfile_test(f):
    global cycle
    cycle = 0

    regfile_test_cycle(f,0,0,0,31,31,0,0,0,0)

    # write registers with their number, test read ports
    for i in xrange(34):
        ra2sel = 0
        wasel = 0
        werf = 1 if i < 32 else 0
        ra = i-1 if i > 1 and i < 33 else 0
        rb = i-2 if i > 2 else 0
        rc = i if i < 32 else 31
        wdata = i if i < 32 else 0
        radata = None if i < 1 else ra if ra != 31 else 0
        rbdata = None if i < 1 else rb if rb != 31 else 0
        regfile_test_cycle(f,ra2sel,wasel,werf,ra,rb,rc,wdata,radata,rbdata)

    regfile_test_cycle(f,1,0,0,1,2,3,0,1,3)  # test ra2sel
    regfile_test_cycle(f,1,0,0,1,2,31,0,1,0) # read with Rc=31

    regfile_test_cycle(f,1,0,0,1,31,4,0,1,4) # read with ra2sel but Rb=31
    regfile_test_cycle(f,0,1,1,1,2,31,12345,1,2) # write with wasel=1, rc=31
    regfile_test_cycle(f,0,0,0,30,1,2,0,12345,1) # make sure r30 was written correctly

    regfile_test_cycle(f,0,1,1,1,2,3,12345678,1,2) # test wasel
    regfile_test_cycle(f,1,0,0,30,2,30,0,12345678,12345678)  # see if we wrote R30

    # make sure werf isn't tied to 1
    regfile_test_cycle(f,0,0,0,1,2,3,12345678,1,2) # no write
    regfile_test_cycle(f,0,0,0,3,3,3,12345678,3,3) # ensure R3 unchanged

regfile_test(sys.stdout)

##################################################
##  PC
##################################################

def pc_test_cycle(f,reset,pcsel,id,jt,pc,comment=''):
    global cycle
    cycle += 1

    field(f,1,reset,'01')
    field(f,3,pcsel,'01')
    field(f,16,id & 0xFFFF,'01')
    field(f,32,jt & 0xFFFFFFFF,'01')

    offset = (id - 0x10000) if id >= 0x8000 else id   # sign extension
    pc_inc = (pc & 0x80000000) + ((pc + 4) & 0x7FFFFFFC)
    pc_offset = (pc & 0x80000000) + ((pc + 4 + 4*offset) & 0x7FFFFFFC)

    field(f,32,pc,'LH')
    field(f,32,pc_inc,'LH')
    field(f,32,pc_offset,'LH',suffix=' // %3d: %s\n' % (cycle,comment))

def pc_test(f):
    global cycle
    cycle = 0

    # test reset, illop, xadr
    pc_test_cycle(f,1,3,-1,0,0x80000000,'reset, PC==0x80000000')
    pc_test_cycle(f,1,4,0,0,0x80000000,'reset, PC==0x80000000')
    pc_test_cycle(f,0,4,-2,0,0x80000008,'xadr, PC==0x80000008, offset=-2')
    pc_test_cycle(f,0,3,0x7FFF,0,0x80000004,'illop, PC==0x80000004, offset=0x7fff')
    pc_test_cycle(f,0,2,0,0xFFFFFFF0,0xFFFFFFF0,'jmp, pc==0XFFFFFFF0')
    pc_test_cycle(f,0,0,-1,0,0xFFFFFFF4,'inc, pc==0xFFFFFFF4, offset=-1')
    pc_test_cycle(f,0,0,-2,0,0xFFFFFFF8,'inc, pc==0xFFFFFFF8, offset=-1')
    pc_test_cycle(f,0,0,-3,0,0xFFFFFFFC,'inc, pc==0xFFFFFFFC, offset=-1')
    pc_test_cycle(f,0,0,-4,0,0x80000000,'inc, pc==0x80000000, offset=-1')

    # test JMP w/ and w/o supervisor bit
    pc_test_cycle(f,0,2,0x8000,0x7FFFFFFF,0x7FFFFFFC,'jmp to user mode, PC==0x7FFFFFFC, offset=0x8000')
    pc_test_cycle(f,0,2,-9,0x87654321,0x07654320,'jmp to super mode?, PC==0x07654320, offset=-9')

    # test increment (use JMP set PC, followed by inc cycle)
    pc_test_cycle(f,0,2,0,0x00000004,0x00000004,'jmp, PC==0x0')
    pc_test_cycle(f,0,0,0,0,0x00000008,'inc')
    pc_test_cycle(f,0,0,0,0,0x0000000C,'inc')
    pc_test_cycle(f,0,0,0,0,0x00000010,'inc')
    pc_test_cycle(f,0,1,2,0x000000F0,0x0000001C,'br, offset=3, PC==0x1C')
    pc_test_cycle(f,0,0,0,0,0x00000020,'inc')
    pc_test_cycle(f,0,2,0,0x0000003C,0x0000003C,'jmp, PC==0x3C')
    pc_test_cycle(f,0,0,0,0,0x00000040,'inc')
    pc_test_cycle(f,0,2,0,0x0000007C,0x0000007C,'jmp, PC==0x7C')
    pc_test_cycle(f,0,0,0,0,0x00000080,'inc')
    pc_test_cycle(f,0,2,0,0x0000FFFC,0x0000FFFC,'jmp, PC==0xFFFC')
    pc_test_cycle(f,0,0,0,0,0x00010000,'inc')
    pc_test_cycle(f,0,2,0,0x00FFFFFC,0x00FFFFFC,'jmp, PC==0xFFFFFC')
    pc_test_cycle(f,0,0,0,0,0x01000000,'inc')
    pc_test_cycle(f,0,2,0,0x7FFFFFFC,0x7FFFFFFC,'jmp, PC==0x7FFFFFFC')
    pc_test_cycle(f,0,0,-2,0,0x00000000,'inc')

#pc_test(sys.stdout)

##################################################
##  Control
##################################################

ctlrom = """
// alufn[5:0]
// asel, bsel
// moe, mwr
// pcsel[2:0]
// ra2sel
// wasel, wdsel[2:0], werf
0b??????_??_?0_011_?_1001  // 0b000000
0b??????_??_?0_011_?_1001  // 0b000001
0b??????_??_?0_011_?_1001  // 0b000010
0b??????_??_?0_011_?_1001  // 0b000011
0b??????_??_?0_011_?_1001  // 0b000100
0b??????_??_?0_011_?_1001  // 0b000101
0b??????_??_?0_011_?_1001  // 0b000110
0b??????_??_?0_011_?_1001  // 0b000111

0b??????_??_?0_011_?_1001  // 0b001000
0b??????_??_?0_011_?_1001  // 0b001001
0b??????_??_?0_011_?_1001  // 0b001010
0b??????_??_?0_011_?_1001  // 0b001011
0b??????_??_?0_011_?_1001  // 0b001100
0b??????_??_?0_011_?_1001  // 0b001101
0b??????_??_?0_011_?_1001  // 0b001110
0b??????_??_?0_011_?_1001  // 0b001111

// alufn[5:0]
// asel, bsel
// moe, mwr
// pcsel[2:0]
// ra2sel
// wasel, wdsel[2:0], werf
0b??????_??_?0_011_?_1001  // 0b010000
0b??????_??_?0_011_?_1001  // 0b010001
0b??????_??_?0_011_?_1001  // 0b010010
0b??????_??_?0_011_?_1001  // 0b010011
0b??????_??_?0_011_?_1001  // 0b010100
0b??????_??_?0_011_?_1001  // 0b010101
0b??????_??_?0_011_?_1001  // 0b010110
0b??????_??_?0_011_?_1001  // 0b010111

0b010000_01_10_000_?_0101  // 0b011000 LD
0b010000_01_01_000_1_???0  // 0b011001 ST
0b??????_??_?0_011_?_1001  // 0b011010
0b??????_??_?0_010_?_0001  // 0b011011 JMP
0b??????_??_?0_110_?_0001  // 0b011100 BEQ
0b??????_??_?0_111_?_0001  // 0b011101 BNE
0b??????_??_?0_011_?_1001  // 0b011110
0b101010_1?_10_000_?_0101  // 0b011111 LDR

// alufn[5:0]
// asel, bsel
// moe, mwr
// pcsel[2:0]
// ra2sel
// wasel, wdsel[2:0], werf
0b010000_00_?0_000_0_0011  // 0b100000 ADD
0b010001_00_?0_000_0_0011  // 0b100001 SUB
0b??????_??_?0_011_?_1001  // 0b100010 MUL
0b??????_??_?0_011_?_1001  // 0b100011 DIV
0b000011_00_?0_000_0_0011  // 0b100100 CMPEQ
0b000101_00_?0_000_0_0011  // 0b100101 CMPLT
0b000111_00_?0_000_0_0011  // 0b100110 CMPLE
0b??????_??_?0_011_?_1001  // 0b100111

0b101000_00_?0_000_0_0011  // 0b101000 AND
0b101110_00_?0_000_0_0011  // 0b101001 OR
0b100110_00_?0_000_0_0011  // 0b101010 XOR
0b101001_00_?0_000_0_0011  // 0b101011 XNOR
0b110000_00_?0_000_0_0011  // 0b101100 SHL
0b110001_00_?0_000_0_0011  // 0b101101 SHR
0b110011_00_?0_000_0_0011  // 0b101110 SRA
0b??????_??_?0_011_?_1001  // 0b101111

// alufn[5:0]
// asel, bsel
// moe, mwr
// pcsel[2:0]
// ra2sel
// wasel, wdsel[2:0], werf
0b010000_01_?0_000_?_0011  // 0b100000 ADDC
0b010001_01_?0_000_?_0011  // 0b100001 SUBC
0b??????_??_?0_011_?_1001  // 0b100010 MULC
0b??????_??_?0_011_?_1001  // 0b100011 DIVC
0b000011_01_?0_000_?_0011  // 0b100100 CMPEQC
0b000101_01_?0_000_?_0011  // 0b100101 CMPLTC
0b000111_01_?0_000_?_0011  // 0b100110 CMPLEC
0b??????_??_?0_011_?_1001  // 0b100111

0b101000_01_?0_000_?_0011  // 0b101000 ANDC
0b101110_01_?0_000_?_0011  // 0b101001 ORC
0b100110_01_?0_000_?_0011  // 0b101010 XORC
0b101001_01_?0_000_?_0011  // 0b101011 XNORC
0b110000_01_?0_000_?_0011  // 0b101100 SHLC
0b110001_01_?0_000_?_0011  // 0b101101 SHRC
0b110011_01_?0_000_?_0011  // 0b101110 SRAC
0b??????_??_?0_011_?_1001  // 0b101111
"""

betaop = [
"???", "???", "???", "???", "???", "???", "???", "???", "???", "???", "???", "???", "???", "???", "???", "???", "???", "???", "???", "???", "???", "???", "???", "???", "LD", "ST", "???", "JMP", "BEQ", "BNE", "???", "LDR", "ADD", "SUB", "MUL", "DIV", "CMPEQ", "CMPLT", "CMPLE", "???", "AND", "OR", "XOR", "XNOR", "SHL", "SHR", "SRA", "???", "ADDC", "SUBC", "MULC", "DIVC", "CMPEQC", "CMPLTC", "CMPLEC", "???", "ANDC", "ORC", "XORC", "XNORC", "SHLC", "SHRC", "SRAC", "???"
]

def read_rom(rom):
    # reformat master into a list of values
    rom = re.sub(r'\/\*(.|\n)*?\*\/','',rom)   # remove multi-line comments
    rom = re.sub(r'\/\/.*','',rom); # single-line comment
    rom = re.sub(r'[+_]','',rom)    # random formatting characters
    rom = re.sub(r'^0b','',rom,flags=re.M)     # 0b at front
    return rom.split()

def ctl_test_cycle(f,op,reset,irq,z,alufn,asel,bsel,moe,mwr,pcsel,ra2sel,wasel,wdsel,werf,comment):
    global cycle
    cycle += 1
    field(f,6,op,'01')
    field(f,3,reset*4 + irq*2 + z,'01')

    xfield(f,6,alufn,'LH')
    xfield(f,1,asel,'LH','')
    xfield(f,1,bsel,'LH')
    xfield(f,1,moe,'LH','')
    xfield(f,1,mwr,'LH')
    xfield(f,3,pcsel,'LH')
    xfield(f,1,ra2sel,'LH')
    xfield(f,1,wasel,'LH','')
    xfield(f,2,wdsel,'LH','')
    xfield(f,1,werf,'LH',suffix= ' // %3d: %s\n' % (cycle,comment))

def ctl_test(f):
    global cycle
    cycle = 0

    # process control rom
    content = read_rom(ctlrom)
    assert len(content)==64, 'ctlrom does not have 64 entries'

    for op in xrange(len(content)):
        sigs = content[op]
        alufn = sigs[:6]
        asel = sigs[6]
        bsel = sigs[7]
        moe = sigs[8]
        mwr = sigs[9]
        pcsel = sigs[10:13]
        ra2sel = sigs[13]
        wasel = sigs[14]
        wdsel = sigs[15:17]
        werf = sigs[17]
        # for each opcode test all combinations of reset, irq and z
        for reset in (0,1):
            for irq in (0,1):
                for z in (0,1):
                    comment = str.format('op=0b{:06b} {:s}',op,betaop[op])
                    if reset:
                        ctl_test_cycle(f,op,reset,irq,z,None,None,None,None,'0',None,None,None,None,None,comment)
                    elif irq:
                        ctl_test_cycle(f,op,reset,irq,z,None,None,None,None,'0','100',None,'1','00','1',comment)
                    else:
                        if pcsel[:2] == '11':
                            xpcsel = '001' if z ^ int(pcsel[2]) else '000'
                        else: xpcsel = pcsel
                        ctl_test_cycle(f,op,reset,irq,z,alufn,asel,bsel,moe,mwr,xpcsel,ra2sel,wasel,wdsel,werf,comment)

#ctl_test(sys.stdout)

##################################################
##  Beta
##################################################

# built from log created by running lab5checkoff.uasm on a good beta
# using the following test

"""
.power Vdd=1
.thresholds Vol=0 Vil=0.1 Vih=0.9 Voh=1

.group inputs RESET IRQ

.log RESET IRQ MOE MWR IA[31:0] ID[31:0] MA[31:0] MRD[31:0] MWD[31:0]

.mode gate

.cycle CLK=1 tran 5n assert inputs tran 45n CLK=0 tran 49n log tran 1n

10
.repeat 416
00
01
.repeat 15
00
"""

def beta_test_cycle(f,reset,irq,ia,id,ma,moe,mwr,mrd,mwd,comment = ''):
    global cycle
    cycle += 1
    xfield(f,1,reset,'01','')
    xfield(f,1,irq,'01')

    xfield(f,32,ia,'LH')
    xfield(f,32,id,'LH')
    xfield(f,32,ma,'LH')
    xfield(f,1,moe,'LH','')
    xfield(f,1,mwr,'LH')
    xfield(f,32,mrd,'LH')
    xfield(f,32,mwd,'LH',suffix= ' // %3d: %s\n' % (cycle,comment))

def disassemble(reset,irq,ia,id):
    if reset=='1':
        return 'reset'
    if irq=='1' and ia[0]=='0':
        return 'interrupt'
    if not id[:2] in ['00', '01', '10', '11']:
        return ''

    pc = str.format('[{:03x}] ',int(ia[1:],2))
    opcode = betaop[int(id[:6],2)]
    if opcode[0] == '?':
        return pc+ str.format('illop op=0b%s' % id[:6])

    rc = int(id[6:11],2)
    ra = int(id[11:16],2)
    rb = int(id[16:21],2)
    literal = int(id[16:32],2)
    if literal >= 0x8000: literal -= 0x10000
    offset_addr = int(ia[1:32],2) + 4*literal + 4

    if id[:2] == '10':
        return pc + '%s(R%d,R%d,R%d)' % (opcode,ra,rb,rc)
    elif id[:2] == '11':
        return pc + '%s(R%d,0x%x,R%d)' % (opcode,ra,literal & 0xFFFF,rc)
    elif opcode == 'LD':
        return pc + 'LD(R%d,0x%x,R%d)' % (ra,literal & 0xFFFF,rc)
    elif opcode == 'ST':
        return pc + 'ST(R%d,0x%x,R%d)' % (rc,literal & 0xFFFF,ra)
    elif opcode == 'LDR':
        return pc + 'LDR(0x%x,R%d)' % (offset_addr,rc)
    elif opcode == 'JMP':
        return pc + 'JMP(R%d,R%d)' % (ra,rc)
    elif opcode == 'BEQ' or opcode == 'BNE':
        return pc + '%s(R%d,0x%x,R%d)' % (opcode,ra,offset_addr,rc)
    else:
        return 'unknown instruction'

def beta_test(f):
    global cycle
    cycle = 0

    # process control rom
    content = read_rom(ctlrom)
    assert len(content)==64, 'ctlrom does not have 64 entries'

    log = open('beta_log')
    for line in log:
        # break down log entry into useful values
        lreset = line[0]
        lirq = line[1]
        lmoe = line[2]
        lmwr = line[3]
        lia = line[4:36]
        lid = line[36:68]
        lma = line[68:100]
        lmrd = line[100:132]
        lmwd = line[132:164]

        # read in opcode and determine control signals
        if lreset == '1':
            sigs = '?????????0????????'
        elif lirq == '1':
            sigs = '?????????0100?1001'
        else:
            sigs = content[int(lid[:6],2)]
        alufn = sigs[:6]
        asel = sigs[6]
        bsel = sigs[7]
        moe = sigs[8]
        mwr = sigs[9]
        pcsel = sigs[10:13]
        ra2sel = sigs[13]
        wasel = sigs[14]
        wdsel = sigs[15:17]
        werf = sigs[17]

        if alufn[0] == '?': lma = None
        if moe == '?':
            lmrd = None
            lmoe = None
        if lmwr != '1': lmwd = None

        beta_test_cycle(f,lreset,lirq,lia,lid,lma,lmoe,lmwr,lmrd,lmwd,disassemble(lreset,lirq,lia,lid))
        
#beta_test(sys.stdout)
