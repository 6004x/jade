import sys,random

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
    field(f,2,2*ra2sel + wasel,'01')
    field(f,1,werf,'01')
    field(f,5,ra,'01')
    field(f,5,rb,'01')
    field(f,5,rc,'01')
    field(f,32,wdata,'01')
    field(f,32,radata,'LH')
    field(f,32,rbdata,'LH')
    f.write(' // Ra[%s]==%s, %s[%s]==%s' % (ra,radata,'Rc' if ra2sel else 'Rb',rb,rbdata))
    if werf:
        f.write(' Reg[%s]=%s' % (30 if wasel else rc,wdata))
    f.write('\n')

def regfile_test(f):
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
        rbdata = None if i < 2 else rb if rb != 31 else 0
        regfile_test_cycle(f,ra2sel,wasel,werf,ra,rb,rc,wdata,radata,rbdata)

    regfile_test_cycle(f,1,0,0,1,2,3,0,1,3)  # test ra2sel
    regfile_test_cycle(f,1,0,0,1,2,31,0,1,0) # read with Rc=31

    regfile_test_cycle(f,0,1,1,1,2,3,12345678,1,2) # test wasel
    regfile_test_cycle(f,1,0,0,30,2,30,0,12345678,12345678)  # see if we wrote R30

#regfile_test(sys.stdout)

##################################################
##  PC
##################################################

def pc_test_cycle(f,reset,pcsel,id,jt,pc,comment=''):
    field(f,1,reset,'01')
    field(f,3,pcsel,'01')
    field(f,16,id & 0xFFFF,'01')
    field(f,32,jt & 0xFFFFFFFF,'01')

    offset = (id - 0x10000) if id >= 0x8000 else id   # sign extension
    pc_inc = (pc & 0x80000000) + ((pc + 4) & 0x7FFFFFFC)
    pc_offset = (pc & 0x80000000) + ((pc + 4 + 4*offset) & 0x7FFFFFFC)

    field(f,32,pc,'LH')
    field(f,32,pc_inc,'LH')
    field(f,32,pc_offset,'LH',suffix=' // '+comment+'\n')

def pc_test(f):
    # test reset, illop, xadr
    pc_test_cycle(f,1,3,-1,0,0x80000000,'reset, PC==0x80000000')
    pc_test_cycle(f,1,4,0,0,0x80000000,'reset, PC==0x80000000')
    pc_test_cycle(f,0,3,0x7FFF,0,0x80000004,'illop, PC==0x80000004, offset=0x7fff')
    pc_test_cycle(f,0,4,-2,0,0x80000008,'xadr, PC==0x80000008, offset=-2')
    pc_test_cycle(f,0,2,0,0xFFFFFFF0,0xFFFFFFF0,'jmp, pc==0XFFFFFFF0')
    pc_test_cycle(f,0,0,-1,0,0xFFFFFFF4,'inc, pc==0xFFFFFFF4, offset=-1')
    pc_test_cycle(f,0,0,-2,0,0xFFFFFFF8,'inc, pc==0xFFFFFFF8, offset=-1')
    pc_test_cycle(f,0,0,-3,0,0xFFFFFFFC,'inc, pc==0xFFFFFFFC, offset=-1')
    pc_test_cycle(f,0,0,-4,0,0x80000000,'inc, pc==0x80000000, offset=-1')

    # test JMP w/ and w/o supervisor bit
    pc_test_cycle(f,0,2,0x8000,0x7FFFFFFF,0x7FFFFFFC,'jmp to user mode, PC==0x7FFFFFFC, offset=0x8000')
    pc_test_cycle(f,0,2,-9,0x87654321,0x07654320,'jmp to super mode?, PC==0x77654320, offset=-9')

    # test increment (use JMP set PC, followed by inc cycle)
    pc_test_cycle(f,0,2,0,0x00000004,0x00000004,'jmp, PC==0x0')
    pc_test_cycle(f,0,0,0,0,0x00000008,'inc')
    pc_test_cycle(f,0,0,0,0,0x0000000C,'inc')
    pc_test_cycle(f,0,0,0,0,0x00000010,'inc')
    pc_test_cycle(f,0,2,0,0x0000001C,0x0000001C,'jmp, PC==0x1C')
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

pc_test(sys.stdout)
