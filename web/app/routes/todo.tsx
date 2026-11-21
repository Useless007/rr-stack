import { useParams } from "react-router";
import { TodoPage } from "~/components/todo-page";

export default function TodoDetail() {
  // A non-number id reaches the API and comes back as a typed 400.
  return <TodoPage id={Number(useParams().id)} />;
}
