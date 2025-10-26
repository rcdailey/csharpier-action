// Test file with intentionally bad formatting
namespace  TestNamespace
{
public class    BadlyFormattedClass {
private string    longFieldName;
      private int    anotherField;

public BadlyFormattedClass(string  value,int number)
{
this.longFieldName=value;
        this.anotherField = number;
}

    public void   SomeMethod( )
    {
            if(longFieldName!=null)
        {
Console.WriteLine(  "Hello, World!"  );
        }
    }

public int    Calculate(int a,int b,int c)
{
return a+b+c;
}
}
}
