import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { username, password, officerName } = await request.json();

    // Simple hardcoded credentials for demo
    if (
      (username === 'inspector' && password === 'password123') ||
      (username === 'admin' && password === 'admin123')
    ) {
      const role = username === 'admin' ? 'admin' : 'inspector';
      const cleanOfficerName = (typeof officerName === 'string' && officerName.trim()) ? officerName.trim() : 'Debayan Thakur, LMO';
      
      const response = NextResponse.json({ success: true, role, officerName: cleanOfficerName });
      
      // Set secure HTTP-only cookie
      response.cookies.set({
        name: 'auth_token',
        value: JSON.stringify({ username, role, officerName: cleanOfficerName }),
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24, // 1 day
      });
      
      return response;
    }

    return NextResponse.json({ success: false, error: 'Invalid credentials' }, { status: 401 });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
