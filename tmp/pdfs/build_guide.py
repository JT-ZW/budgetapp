from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, white
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from PIL import Image
from pathlib import Path
import subprocess
root=Path.cwd(); out=root/'output/pdf/RTG_Supplier_Registration_Quick_Guide.pdf'
ids=['f214f61a-55b8-4abc-a655-e2be7b9edbf3','2302fd0a-be3b-4012-b95b-ef9fac97a005','b8e19073-c3b2-44e5-8746-7d469a5962a8','d6ddfa48-a9f0-4d54-ab85-16571478027a','12b5daa0-ee45-4157-811d-5ed8396afae0','69970632-2cc9-4479-9511-f3f4b7ecfbb5','3fe5412f-1a0e-4d4f-b635-fd552fe303f5','824678ba-4bd7-4735-a8b8-93b9a53be306','d62bd54f-9229-4dcd-aa3d-db7e9e1d3172']
imgs=[Image.open(Path('C:/Users/JEFFRE~1.MUR/AppData/Local/Temp')/('codex-clipboard-'+i+'.png')) for i in ids]
W,H=842,595
c=canvas.Canvas(str(out),pagesize=(W,H)); c.setTitle('RTG Partners | Supplier registration quick guide'); c.setAuthor('RTG Partners')
dark='#1B1911'; gold='#A87520'; muted='#625C51'
def para(text,x,y,w,size=11,color=dark):
 p=Paragraph(text,ParagraphStyle('p',fontName='Helvetica',fontSize=size,leading=size*1.4,textColor=HexColor(color))); _,h=p.wrap(w,500); p.drawOn(c,x,y-h); return y-h

def base(n,title,sub):
 c.setFillColor(HexColor('#FAF8F3')); c.rect(0,0,W,H,fill=1,stroke=0)
 c.setFillColor(HexColor(dark));c.rect(0,H-42,W,42,fill=1,stroke=0)
 c.setFillColor(white);c.setFont('Helvetica-Bold',11);c.drawString(30,H-26,'RTG PARTNERS  /  SUPPLIER PORTAL')
 c.setFillColor(HexColor('#E0BB66'));c.setFont('Helvetica',10);c.drawRightString(W-30,H-26,'USER GUIDE')
 para(title,30,532,780,24);para(sub,30,493,780,11,muted)
 c.setStrokeColor(HexColor('#DED6C7'));c.line(30,34,W-30,34)
 c.setFillColor(HexColor(muted));c.setFont('Helvetica',8);c.drawString(30,20,'October 2026 | Screens show example data. Enter your own business details.');c.drawRightString(W-30,20,f'{n} / 5')
def shot(i,box,x,y,w,h):
 im=imgs[i].crop(box); iw,ih=im.size; scale=min(w/iw,h/ih); dw,dh=iw*scale,ih*scale
 c.drawImage(ImageReader(im),x+(w-dw)/2,y+(h-dh)/2,dw,dh)
def label(t,x,y):return para(t,x,y,370,14)
def end():c.showPage()
base(1,'01  Start your application','Open the supplier portal using the link provided with your beta invitation.')
label('Open supplier registration',30,457);shot(0,(10,120,1890,1120),30,222,380,215)
para('Select <b>Start supplier registration</b> or <b>Register your business</b>.',30,205,375)
label('Choose your supplier path',435,457);shot(1,(1110,430,1775,815),435,222,375,215)
para('<b>New supplier:</b> start a standard application.<br/><b>Existing supplier:</b> link your RTG supplier record first.',435,205,375)
para('<b>Before you begin</b>  Have your business details, contact information, director ID documents, trade references and compliance documents ready.',30,125,780,11)
para('<b>Already started?</b> Use <b>Continue an application</b> or <b>Supplier sign in</b> to return to your account.',30,76,780,10)
end()
base(2,'02  Link your record and create an account','Existing suppliers complete the record lookup. New suppliers continue to account creation.')
shot(2,(1110,205,1775,1040),30,128,285,340)
para('<b>Existing suppliers only</b><br/>Enter your RTG vendor code and official registered company name. Select <b>Find supplier record</b> and follow the prompts.<br/><br/>Unsure of your vendor code? Contact your respective RTG buyer.',330,456,180,11)
shot(3,(1110,215,1775,1030),535,128,277,340)
para('<b>Create your account</b>  Read and accept the privacy terms when prompted. Enter your email, create and confirm your password, then select <b>Create Account &amp; Continue</b>.',30,108,780,11)
para('<b>Password:</b> 12-128 characters with uppercase, lowercase, a number and a special character.',30,62,780,10)
end()
base(3,'03  Complete your business profile','Follow the progress bar: Business & location, Details, Documents, then Review & submit.')
label('Enter business and location details',30,457);shot(4,(55,570,1840,1120),30,270,780,170)
para('Select your country and complete the required fields marked <b>*</b>, including your registered company name, registration number and tax identification number. Scroll down to complete the remaining business and location fields.',30,255,780,11)
shot(5,(950,560,1730,830),435,95,375,130)
para('<b>Select your supply categories</b><br/>Tick the categories that match the goods or services you provide.<br/><br/>Choose the small-scale farmer option only if it applies. Website and postal code are optional.',30,190,375,11)
para('For Zimbabwean businesses, the tax identification number accepts digits only, up to 10 digits.',30,64,780,10)
end()
base(4,'04  Add contacts, directors and references','Provide accurate details so RTG can contact your business and verify your application.')
label('Company contact and directors',30,457);shot(6,(85,260,1810,1050),30,250,380,190)
para('Enter the contact person\'s name, role and phone number. Add <b>1-5 directors</b> and complete their required details.<br/><br/>Upload each director\'s <b>national ID or passport</b>: PDF, JPG or PNG, maximum <b>5 MB</b>. Use <b>+ Add more directors</b> when needed.',30,232,375,11)
label('Trade references',435,457);shot(7,(90,300,1810,955),435,250,375,190)
para('Add <b>1-5 trade references</b>. For each, enter the company name, contact person, email, phone and relationship.<br/><br/>Choose <b>Yes</b> or <b>No</b> to indicate whether RTG may contact that reference. Select <b>Next: documents</b> to continue.',435,232,375,11)
para('<b>Need a break?</b> Select <b>Save draft</b> before leaving. Sign in later to resume. Use <b>Previous</b> to revisit earlier details.',30,87,780,11)
end()
base(5,'05  Upload documents, review and submit','Complete the required document list shown for your application before final submission.')
shot(8,(85,280,1380,1120),30,180,465,285)
para('<b>Formal company checklist shown</b><br/>1. Company profile<br/>2. Certificate of incorporation<br/>3. CR14 or CR6<br/>4. CR5<br/>5. Physical address proof<br/>6. VAT certificate<br/>7. Tax clearance certificate<br/>8. FDMS compliance proof',520,456,290,12)
para('Select <b>Choose file</b> beside each document. Follow the upload rules displayed in the portal. Category evidence is optional in the screen shown.',30,163,465,11)
para('<b>Strengthen your application:</b> Add any exclusive dealership certificates and industry-specific certifications or compliance documents to support your application and improve your chances of approval.',520,245,290,11)
para('<b>Final review</b>  Continue to <b>Review &amp; submit</b>. Check your details and uploaded documents, resolve any outstanding requirements, then submit for Procurement review.',30,100,780,11)
para('The final review and confirmation screens were not supplied. Follow the on-screen prompts to complete submission.',30,56,780,9,muted)
end();c.save()
subprocess.run(['pdftoppm','-scale-to','1000','-png',str(out),str(root/'tmp/pdfs/page')],check=True)
print(out)


