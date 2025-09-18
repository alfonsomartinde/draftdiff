import { TestBed } from '@angular/core/testing';
import { TimerComponent } from './timer.component';
import { provideZonelessChangeDetection } from '@angular/core';

describe('TimerComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TimerComponent],
      providers: [provideZonelessChangeDetection()],
    });
  });

  it('renders the provided value', () => {
    const fixture = TestBed.createComponent(TimerComponent);
    fixture.componentRef.setInput('value', 12);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('12');
  });
});


