import { currentUser } from '@/lib/auth';
import { Assistant } from '@/components/assistant';
import { PageHeading } from '@/components/ui';
export const metadata = {title:'Jelly · Asistent AI'};
export default async function AssistantPage() {
  const user = await currentUser();
  return <div className="container page"><PageHeading eyebrow="Jelly · Asistent AI" title="O întrebare. Un pas mai clar." description="Explicăm, explorăm idei și găsim împreună un punct de pornire."/><Assistant signedIn={Boolean(user)} fullPage/></div>;
}
