import { fetchCategories } from "../api/client";
import { useFetch } from "./useFetch";

export function useCategories() {
  return useFetch(fetchCategories, []);
}
