# Generate bits for Jade implementation of Beta Control ROM

from testvecutils import *

BETAOP = [
    "???", "???", "???", "???", "???", "???", "???", "???",
    "???", "???", "???", "???", "???", "???", "???", "???",
    "???", "???", "???", "???", "???", "???", "???", "???",
    "LD",  "ST",  "???", "JMP", "BEQ", "BNE", "???", "LDR",
    "ADD", "SUB", "MUL", "DIV", "CMPEQ", "CMPLT", "CMPLE", "???", 
    "AND", "OR",  "XOR", "XNOR","SHL", "SHR", "SRA", "???",
    "ADDC", "SUBC", "MULC", "DIVC", "CMPEQC", "CMPLTC", "CMPLEC", "???",
    "ANDC", "ORC", "XORC", "XNORC", "SHLC", "SHRC", "SRAC", "???"
    ]


################################################################################
### Part I: Generate binary CTLROM contents
################################################################################

IWIDTH=8
OWIDTH=17

# Initialize CTLROM image to all zeros:
CTLROM = [ 0 for adr in range(1<<IWIDTH) ]

# Set a CTLROM location:
def SetCtl(opc=0,                       # OPC[5:0]
           z=0,                         # Z bit
           irq=0,                       # Interrupt request
           alufn=0,                     # ALUFN[4:0]
           werf=0,                      # WERF
           bsel=0,
           asel=0,
           wdsel=0,                     # WDSEL[1:0]
           wr=0,
           ra2sel=0,
           pcsel=0,
           wasel=0,
           moe=0):

    global CTLROM

    adr = opc<<2 | irq<<1 | z;

    data = pcsel<<14 | ra2sel<<13 | asel<<12 | bsel<<11 | wdsel<<9
    data |= alufn<<4 | wr<<3 | werf<<2 | wasel<<1 | moe

    if 0:
        if CTLROM[adr] != 0:
            raise Exception, "CTLROM location already set!"

    CTLROM[adr] = data


# Fill CTLROM for an ALU Op instruction:
def ALUOp(opc, alufn):

    for z in range(2):
        # Operate class instruction, 2 source regs:
        SetCtl(opc=opc, z=z, irq=0,
               alufn=alufn, werf=1, bsel=0, wdsel=1, wr=0,
               ra2sel=0, pcsel=0, asel=0, wasel=0)
        # OPC instruction, constant operand:
        SetCtl(opc=opc | 0b10000, z=z, irq=0,
               alufn=alufn, werf=1, bsel=1, wdsel=1, wr=0,
               ra2sel=0, pcsel=0, asel=0, wasel=0)

# Put proper bits in CTLROM image:
def BuildCTL():

    # Initialize everything to IllOp:
    for opc in range(64):
        for z in range(2):
            SetCtl(opc=opc, irq=0, z=z,
                   werf=1, wdsel=0, wr=0, pcsel=3, wasel=1)

    # Then, get the IRQ=1 cases out of the way:
    for opc in range(64):
        for z in range(2):
            SetCtl(opc=opc, z=z, irq=1,
                   werf=1, wdsel=0, wr=0, pcsel=4, wasel=1)

    # Next, get the OP/OPC class instructions done:
    ALUOp(0b100000, 0b00000)            #  ADD
    ALUOp(0b100001, 0b00001)            #  SUB
    ALUOp(0b100010, 0b00010)            #  MUL

    ALUOp(0b100100, 0b00101)            #  CMPEQ
    ALUOp(0b100101, 0b00111)            #  CMPLT
    ALUOp(0b100110, 0b01101)            #  CMPLE

    ALUOp(0b101000, 0b11000)            #  AND
    ALUOp(0b101001, 0b11110)            #  OR
    ALUOp(0b101010, 0b10110)            #  XOR
    ALUOp(0b101011, 0b11001)            #  XNOR

    ALUOp(0b101100, 0b01000)            # SHL
    ALUOp(0b101101, 0b01001)            # SHR
    ALUOp(0b101110, 0b01011)            # SRA

    for z in range(2):

        # Branches:
        SetCtl(opc=0b011100, z=z, irq=0, # BEQ
               werf=1, wdsel=0, wr=0, wasel=0,
               pcsel = z)
        SetCtl(opc=0b011101, z=z, irq=0, # BNE
               werf=1, wdsel=0, wr=0, wasel=0,
               pcsel = 1 ^ z)
        
        # LDR:
        SetCtl(opc=0b011111, z=z, irq=0,
               alufn=0b11010,
               werf=1, wdsel=2, wr=0, pcsel=0, asel=1, wasel=0, moe=1)

        # JMP:
        SetCtl(opc=0b011011, z=z, irq=0,
               werf=1, wdsel=0, wr=0, pcsel=2, wasel=0)
        
        # LD:
        SetCtl(opc=0b011000, z=z, irq=0,
               alufn=0b00000,
               werf=1, bsel=1, wdsel=2, wr=0, pcsel=0, asel=0, wasel=0, moe=1)


        # ST:
        SetCtl(opc=0b011001, z=z, irq=0,
               alufn=0b00000, werf=0, bsel=1, wr=1, ra2sel=1, pcsel=0, asel=0)


BuildCTL()
print 80*'#'+'\n'
print "// Control ROM Contents:\n"
for a in range(0, 1<<IWIDTH, 4):
    for b in range(4):
        opc = a >> 2
        print " 0x%05x" % CTLROM[a+b],
    print "  // ", BETAOP[opc]

print 80*'#'


################################################################################
### Part II: Generate test vectors
################################################################################


# print header for a line:
def head():
    print "//                R"
    print "//                A     W            W"
    print "//                2 A B D          W A"
    print "//          I     S S S S        M E S M"
    print "//          R  PC E E E E   ALU  W R E O"
    print "// ..OPC. Z Q SEL L L L L. ..FN. r F L E"

# print CTLROM values for test vector:
def pctl(a, ctl):
#    print "pctl(0x%x)" % ctl

    opc = a >> 2
    irq = (a >> 1) & 1
    z = a & 1

    def f(pos, w=1):
        v = (ctl >> pos ) & ((1<<w)-1)
        return lh(v, w)

    print "  ", bin(opc, 6), bin(z, 1), bin(irq, 1),
    print f(14,w=3), f(13), f(12), f(11), f(9, w=2), f(4, w=5),
    print f(3), f(2), f(1), f(0),
    print " // " + BETAOP[opc]


head()

for a in range(1<<IWIDTH):
    pctl(a, CTLROM[a])



